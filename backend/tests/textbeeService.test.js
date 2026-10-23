const test = require('node:test');
const assert = require('node:assert/strict');

const { sendSms } = require('../src/services/textbeeService');

test('sendSms utiliza el encabezado privado y el formato requerido por TextBee', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TEXTBEE_API_KEY;
    } else {
      process.env.TEXTBEE_API_KEY = originalApiKey;
    }
  });

  process.env.TEXTBEE_API_KEY = 'test-textbee-key';
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, smsBatchId: 'batch-123' } })
    };
  };

  const result = await sendSms('+521234567890', 'Código 123456');

  assert.equal(request.url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['x-api-key'], 'test-textbee-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    recipients: ['+521234567890'],
    message: 'Código 123456'
  });
  assert.deepEqual(result, { smsBatchId: 'batch-123' });
});

test('sendSms rechaza respuestas no exitosas sin exponer el mensaje de respuesta', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TEXTBEE_API_KEY;
    } else {
      process.env.TEXTBEE_API_KEY = originalApiKey;
    }
  });

  process.env.TEXTBEE_API_KEY = 'test-textbee-key';
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ success: false, message: 'secret provider response' })
  });

  await assert.rejects(
    () => sendSms('+521234567890', 'Código 123456'),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /secret provider response|test-textbee-key|123456/);
      return true;
    }
  );
});

test('sendSms rechaza HTTP exitoso cuando TextBee no confirma el envío', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TEXTBEE_API_KEY;
    } else {
      process.env.TEXTBEE_API_KEY = originalApiKey;
    }
  });

  process.env.TEXTBEE_API_KEY = 'test-textbee-key';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        success: false,
        smsBatchId: 'private-batch',
        message: 'Código secreto 123456'
      }
    })
  });

  await assert.rejects(
    () => sendSms('+521234567890', 'Código 123456'),
    (error) => {
      assert.match(error.message, /HTTP 200/);
      assert.doesNotMatch(error.message, /private-batch|test-textbee-key|123456|Código secreto/);
      return true;
    }
  );
});

test('sendSms rechaza confirmaciones sin identificador de lote', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TEXTBEE_API_KEY;
    } else {
      process.env.TEXTBEE_API_KEY = originalApiKey;
    }
  });

  process.env.TEXTBEE_API_KEY = 'test-textbee-key';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { success: true } })
  });

  await assert.rejects(
    () => sendSms('+521234567890', 'Código 123456'),
    (error) => {
      assert.match(error.message, /HTTP 200/);
      assert.doesNotMatch(error.message, /test-textbee-key|123456/);
      return true;
    }
  );
});
