const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

process.env.SMS_CODE_HMAC_SECRET = 'test-sms-hmac-secret-with-at-least-32-characters';
const pool = require('../src/database');
const verification = require('../src/services/verificationService');

function makeDatabaseHarness() {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const records = new Map();
  let transactionTail = Promise.resolve();

  pool.query = async (sql, params = []) => {
    if (String(sql).includes('INSERT INTO phone_verifications')) {
      const [phone, codeHash] = params;
      const existing = records.get(phone);
      if (existing && existing.lastSentAt > Date.now() - 60_000) {
        return { rows: [] };
      }
      records.set(phone, {
        code_hash: codeHash,
        expires_at: new Date(Date.now() + verification.CODE_TTL_MS),
        failed_attempts: 0,
        lastSentAt: Date.now(),
        verified_until: null,
        verified_purpose: null
      });
      return { rows: [{ phone }] };
    }
    if (String(sql).includes('SET code_hash = NULL, expires_at = NULL')) {
      const record = records.get(params[0]);
      if (record?.code_hash === params[1]) {
        record.code_hash = null;
        record.expires_at = null;
        record.verified_until = null;
        record.verified_purpose = null;
      }
      return { rows: [] };
    }
    if (String(sql).includes('SELECT 1 FROM phone_verifications')) {
      const record = records.get(params[0]);
      return {
        rows: record?.verified_until > Date.now() && record.verified_purpose === params[1]
          ? [{ '?column?': 1 }]
          : []
      };
    }
    if (String(sql).includes('SET verified_until = NULL')) {
      const record = records.get(params[0]);
      if (record?.verified_until > Date.now() && record.verified_purpose === params[1]) {
        record.verified_until = null;
        record.verified_purpose = null;
        return { rows: [{ phone: params[0] }] };
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  pool.connect = async () => {
    let releaseTransaction;
    return {
    async query(sql, params = []) {
      const query = String(sql);
      if (query === 'BEGIN') {
        const previous = transactionTail;
        transactionTail = new Promise((resolve) => {
          releaseTransaction = resolve;
        });
        await previous;
        return { rows: [] };
      }
      if (query === 'COMMIT' || query === 'ROLLBACK') {
        releaseTransaction?.();
        return { rows: [] };
      }
      if (query.includes('SELECT code_hash, expires_at, failed_attempts')) {
        const record = records.get(params[0]);
        return { rows: record ? [{ ...record }] : [] };
      }
      if (query.includes('SET failed_attempts = failed_attempts + 1')) {
        records.get(params[0]).failed_attempts += 1;
        return { rows: [] };
      }
      if (query.includes('SET code_hash = NULL,') && query.includes('verified_until = NOW()')) {
        const record = records.get(params[0]);
        record.code_hash = null;
        record.expires_at = null;
        record.failed_attempts = 0;
        record.verified_until = Date.now() + 10 * 60 * 1000;
        record.verified_purpose = params[1];
        return { rows: [] };
      }
      throw new Error(`Unexpected client query: ${query}`);
    },
    release() {}
    };
  };

  return {
    records,
    restore() {
      pool.query = originalQuery;
      pool.connect = originalConnect;
    }
  };
}

test('normaliza únicamente teléfonos mexicanos de diez dígitos', () => {
  assert.equal(verification.normalizePhone('5512345678'), '5512345678');
  assert.equal(verification.normalizePhone('+52 55 1234 5678'), '5512345678');
  assert.equal(verification.normalizePhone('+1 5512345678'), '');
  assert.equal(verification.normalizePhone('teléfono'), '');
});

test('genera códigos seguros de seis dígitos', () => {
  assert.match(verification.generateVerificationCode(), /^\d{6}$/);
});

test('almacena el hash, expira, limita intentos, consume una sola vez y verifica el teléfono', async (t) => {
  const db = makeDatabaseHarness();
  t.after(db.restore);
  const phone = '5512345678';
  const code = '123456';

  await verification.storeVerificationCode(phone, code);
  const record = db.records.get(phone);
  assert.notEqual(record.code_hash, code);
  assert.equal(
    record.code_hash,
    createHmac('sha256', process.env.SMS_CODE_HMAC_SECRET).update(code).digest('hex')
  );
  assert.equal(await verification.consumeVerificationCode(phone, '111111'), false);
  assert.equal(await verification.consumeVerificationCode(phone, '222222'), false);
  assert.equal(await verification.consumeVerificationCode(phone, '333333'), false);
  assert.equal(await verification.consumeVerificationCode(phone, '444444'), false);
  assert.equal(await verification.consumeVerificationCode(phone, '555555'), false);
  assert.equal(await verification.consumeVerificationCode(phone, code), false);
  assert.equal(record.failed_attempts, 5);
  assert.equal(await verification.isPhoneVerified(phone), false);
});

test('rechaza almacenar códigos si falta la clave secreta de HMAC', async (t) => {
  const db = makeDatabaseHarness();
  t.after(db.restore);
  const secret = process.env.SMS_CODE_HMAC_SECRET;
  delete process.env.SMS_CODE_HMAC_SECRET;
  t.after(() => {
    process.env.SMS_CODE_HMAC_SECRET = secret;
  });

  await assert.rejects(
    verification.storeVerificationCode('5512345678', '123456'),
    /SMS_CODE_HMAC_SECRET/
  );
});

test('acepta un código vigente una sola vez y limita los reenvíos', async (t) => {
  const db = makeDatabaseHarness();
  t.after(db.restore);
  const phone = '5512345678';

  await verification.storeVerificationCode(phone, '123456');
  await assert.rejects(
    verification.storeVerificationCode(phone, '654321'),
    verification.VerificationRateLimitError
  );
  assert.equal(await verification.consumeVerificationCode(phone, '123456'), true);
  assert.equal(await verification.isPhoneVerified(`+52${phone}`), true);
  assert.equal(await verification.isPhoneVerified(phone, 'deposit'), false);
  assert.equal(await verification.consumePhoneVerification(phone, 'deposit'), false);
  assert.equal(await verification.consumePhoneVerification(phone), true);
  assert.equal(await verification.isPhoneVerified(phone), false);
  assert.equal(await verification.consumePhoneVerification(phone), false);
  assert.equal(await verification.consumeVerificationCode(phone, '123456'), false);
});

test('solo una solicitud simultánea puede consumir el mismo código SMS', async (t) => {
  const db = makeDatabaseHarness();
  t.after(db.restore);
  const phone = '5512345678';
  await verification.storeVerificationCode(phone, '123456');

  const results = await Promise.all([
    verification.consumeVerificationCode(phone, '123456'),
    verification.consumeVerificationCode(phone, '123456')
  ]);
  assert.deepEqual(results.sort(), [false, true]);
});

test('rechaza códigos vencidos', async (t) => {
  const db = makeDatabaseHarness();
  t.after(db.restore);
  const phone = '5512345678';
  await verification.storeVerificationCode(phone, '123456');
  db.records.get(phone).expires_at = new Date(Date.now() - 1);

  assert.equal(await verification.consumeVerificationCode(phone, '123456'), false);
});
