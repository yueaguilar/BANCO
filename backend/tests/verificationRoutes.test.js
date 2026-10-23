const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const pool = require('../src/database');
const app = require('../src/app');

async function createRig(t) {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  const originalJwtSecret = process.env.JWT_SECRET;
  const records = new Map();
  const authQueries = [];
  const passwordHash = await bcrypt.hash('valid-password', 4);

  process.env.TEXTBEE_API_KEY = 'route-test-key';
  process.env.JWT_SECRET = 'route-test-secret-with-at-least-32-characters';
  pool.query = async (sql, params = []) => {
    const query = String(sql);
    if (query.includes('INSERT INTO phone_verifications')) {
      const [phone, codeHash] = params;
      const existing = records.get(phone);
      if (existing && existing.lastSentAt > Date.now() - 60_000) {
        return { rows: [] };
      }
      records.set(phone, {
        phone,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + 5 * 60_000),
        failed_attempts: 0,
        verified_until: null,
        lastSentAt: Date.now()
      });
      return { rows: [{ phone }] };
    }
    if (query.includes('SET code_hash = NULL, expires_at = NULL')) {
      const record = records.get(params[0]);
      if (record?.code_hash === params[1]) {
        record.code_hash = null;
        record.expires_at = null;
      }
      return { rows: [] };
    }
    if (query.includes('SELECT 1 FROM phone_verifications')) {
      const record = records.get(params[0]);
      return { rows: record?.verified_until > Date.now() ? [{ verified: 1 }] : [] };
    }
    authQueries.push(query);
    if (query.includes('SELECT * FROM users WHERE email = $1')) {
      return {
        rows: [{
          id: 1,
          fullname: 'Demo',
          email: params[0],
          phone: '5512345678',
          password: passwordHash
        }]
      };
    }
    if (query.includes('FROM cuentas c')) {
      return {
        rows: [{
          cuenta_id: 8,
          numero_cuenta: '1234567890',
          saldo: '0.00',
          tarjeta_id: 9,
          numero_tarjeta: '4111111111111111',
          mes_expiracion: 5,
          anio_expiracion: 31
        }]
      };
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  pool.connect = async () => ({
    async query(sql, params = []) {
      const query = String(sql);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) return { rows: [] };
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
        record.verified_until = Date.now() + 10 * 60_000;
        return { rows: [] };
      }
      throw new Error(`Unexpected client query: ${query}`);
    },
    release() {}
  });

  const server = app.listen(0);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = originalApiKey;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  return new Promise((resolve) => {
    server.once('listening', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      fetch: originalFetch,
      records,
      authQueries
    }));
  });
}

async function post(requestFetch, url, route, body) {
  return requestFetch(`${url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('verification routes use SMS, reject bad/reused codes, and require the verified phone for auth', async (t) => {
  const rig = await createRig(t);
  let smsBody;
  global.fetch = async (_url, options) => {
    smsBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, smsBatchId: 'accepted' })
    };
  };

  const send = await post(rig.fetch, rig.url, '/api/verification/send', { phone: '+52 55 1234 5678' });
  assert.equal(send.status, 200);
  assert.deepEqual(await send.json(), {
    success: true,
    message: 'Código SMS enviado al teléfono.'
  });
  assert.deepEqual(smsBody.recipients, ['+525512345678']);
  assert.match(smsBody.message, /\d{6}/);
  assert.equal(smsBody.message.includes(process.env.TEXTBEE_API_KEY), false);

  const code = smsBody.message.match(/\d{6}/)[0];
  const wrongCode = await post(rig.fetch, rig.url, '/api/verification/verify', {
    phone: '5512345678',
    code: '000000'
  });
  assert.equal(wrongCode.status, 401);

  const verified = await post(rig.fetch, rig.url, '/api/verification/verify', {
    phone: '+525512345678',
    code
  });
  assert.equal(verified.status, 200);

  const reused = await post(rig.fetch, rig.url, '/api/verification/verify', {
    phone: '5512345678',
    code
  });
  assert.equal(reused.status, 401);

  const unverifiedAuth = await post(rig.fetch, rig.url, '/api/auth', {
    email: 'demo@example.com',
    password: 'valid-password',
    phone: '5511111111'
  });
  assert.equal(unverifiedAuth.status, 401);
  assert.equal(rig.authQueries.length, 0);

  const login = await post(rig.fetch, rig.url, '/api/auth', {
    email: 'demo@example.com',
    password: 'valid-password',
    phone: '+52 55 1234 5678'
  });
  const loginBody = await login.json();
  assert.equal(login.status, 200);
  assert.equal(loginBody.success, true);
  assert.equal(typeof loginBody.token, 'string');
  assert.equal(loginBody.bankData.numeroCuenta, '1234567890');
});

test('send route fails when TextBee rejects the SMS', async (t) => {
  const rig = await createRig(t);
  global.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ success: false })
  });

  const response = await post(rig.fetch, rig.url, '/api/verification/send', { phone: '5512345678' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).success, false);
  const record = rig.records.get('5512345678');
  assert.equal(record.code_hash, null);
});

test('send route limits repeated SMS requests for the same phone', async (t) => {
  const rig = await createRig(t);
  let smsRequests = 0;
  global.fetch = async () => {
    smsRequests += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    };
  };

  const first = await post(rig.fetch, rig.url, '/api/verification/send', { phone: '5512345678' });
  const second = await post(rig.fetch, rig.url, '/api/verification/send', { phone: '5512345678' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(smsRequests, 1);
});

test('send route rejects malformed and non-Mexican phone numbers', async (t) => {
  const rig = await createRig(t);

  const response = await post(rig.fetch, rig.url, '/api/verification/send', { phone: '+1 555 123 4567' });
  assert.equal(response.status, 400);
  const missingPhone = await post(rig.fetch, rig.url, '/api/verification/send', {});
  assert.equal(missingPhone.status, 400);
});
