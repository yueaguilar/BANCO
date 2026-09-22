const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BREVO_API_KEY = 'test-key';
process.env.BREVO_SENDER_EMAIL = 'noreply@bancoficticio.com';
process.env.BREVO_SENDER_NAME = 'Banco Ficticio';

const { enviarCorreoVerificacion } = require('../src/services/emailService');

test('enviarCorreoVerificacion debe usar Brevo y no devolver el código ni indicios de simulación al cliente', async () => {
  let capturedBody;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      text: async () => ''
    };
  };

  const result = await enviarCorreoVerificacion('demo@example.com', '123456');

  assert.equal(result.simulated, undefined);
  assert.equal(result.email, 'demo@example.com');
  assert.equal(capturedBody.sender.email, 'noreply@bancoficticio.com');
  assert.equal(capturedBody.sender.name, 'Banco Ficticio');
  assert.equal(result.codigo, undefined);
  assert.equal(result.code, undefined);
  assert.ok(typeof result.message === 'string');
});

test('enviarCorreoVerificacion debe fallar si Brevo rechaza el envío', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ message: 'Invalid API key' })
  });

  await assert.rejects(
    () => enviarCorreoVerificacion('demo@example.com', '123456'),
    /Brevo error 401/
  );
});
