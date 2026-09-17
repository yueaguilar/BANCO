const test = require('node:test');
const assert = require('node:assert/strict');

const generateAccountNumber = require('../src/services/accountGenerator');
const { generateNip, generateCardNumber, generateCvv } = require('../src/services/cardGenerator');

test('generateAccountNumber crea un número de cuenta válido', async () => {
  const value = await generateAccountNumber();
  assert.match(value, /^\d{10}$/);
});

test('generateNip crea un NIP válido de 4 dígitos', () => {
  const value = generateNip();
  assert.match(value, /^\d{4}$/);
});

test('generateCardNumber crea una tarjeta Visa válida', async () => {
  const value = await generateCardNumber();
  assert.match(value, /^4\d{15}$/);
});

test('generateCvv genera un CVV dinámico de 3 dígitos', () => {
  const value = generateCvv('4111111111111111', 1500, 12, 30);
  assert.match(value, /^\d{3}$/);
});
