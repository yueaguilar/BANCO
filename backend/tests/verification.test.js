const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateVerificationCode,
  storeVerificationCode,
  consumeVerificationCode
} = require('../src/services/verificationService');

test('generateVerificationCode genera un código de 6 dígitos', () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
});

test('storeVerificationCode y consumeVerificationCode validan un código temporal', () => {
  const key = '5512345678';
  const record = storeVerificationCode(key, '123456', 5 * 60 * 1000);

  assert.ok(record.expiresAt > Date.now());
  assert.equal(consumeVerificationCode(key, '123456'), true);
  assert.equal(consumeVerificationCode(key, '123456'), false);
  assert.equal(consumeVerificationCode('999', '000000'), false);
});

test('consumeVerificationCode rechaza códigos expirados', () => {
  const key = '5512345679';
  const record = storeVerificationCode(key, '654321', 0);

  assert.ok(record.expiresAt <= Date.now());
  assert.equal(consumeVerificationCode(key, '654321'), false);
});
