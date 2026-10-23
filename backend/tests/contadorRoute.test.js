const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters';
process.env.COUNTER_DEVICE_TOKEN = 'test-counter-token-with-more-than-32-characters';
process.env.COUNTER_DEVICE_IDS = 'CNT-001,contador-arduino-01';

const app = require('../src/app');
const pool = require('../src/database');

const originalQuery = pool.query.bind(pool);
const originalConnect = pool.connect.bind(pool);
const loteId = () => crypto.randomUUID();
const operationToken = (userId = 7) => jwt.sign({}, process.env.JWT_SECRET, {
  subject: String(userId),
  issuer: 'banco-kike-api',
  audience: 'banco-kike-web',
  expiresIn: '1h'
});
const headers = {
  'Content-Type': 'application/json',
  'x-device-token': process.env.COUNTER_DEVICE_TOKEN
};

test('POST /api/contador debe validar datos y guardar el registro', async () => {
  pool.query = async (sql, params = []) => {
    if (String(sql).includes('INSERT INTO contadores')) {
      return { rows: [{ id: 1, dispositivo_id: params[0], cantidad_billetes: params[1], fecha_hora: params[2], created_at: '2026-10-15T10:30:00.000Z' }] };
    }

    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'CNT-001',
        cantidad_billetes: 125,
        fecha_hora: new Date().toISOString(),
        lote_id: loteId(),
        estado: 'completado'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.dispositivo_id, 'CNT-001');
    assert.equal(body.data.cantidad_billetes, 125);
    assert.ok(body.data.fecha_hora);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/contador debe rechazar solicitudes sin dispositivo_id', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cantidad_billetes: 10 })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /identificador del dispositivo no es válido/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar cantidades negativas', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: -3
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /entero entre 1 y 10000/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar solicitudes sin cantidad_billetes', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /entero entre 1 y 10000/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar valores que no son números enteros', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 'abc'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /entero entre 1 y 10000/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar cantidades decimales', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 12.5
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /entero entre 1 y 10000/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar fechas inválidas', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 10,
        fecha_hora: 'fecha-no-válida',
        lote_id: loteId(),
        estado: 'completado'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /fecha y hora no son válidas/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe responder 500 si PostgreSQL falla', async () => {
  pool.query = async () => {
    throw new Error('postgres unavailable');
  };

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 10,
        fecha_hora: new Date().toISOString(),
        lote_id: loteId(),
        estado: 'completado'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.message, 'No se pudo guardar el registro del contador.');
    assert.equal(body.details, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/contador debe rechazar solicitudes sin token de dispositivo', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('las rutas protegidas se deshabilitan si faltan los secretos configurados', async () => {
  const jwtSecret = process.env.JWT_SECRET;
  const deviceToken = process.env.COUNTER_DEVICE_TOKEN;
  delete process.env.JWT_SECRET;
  delete process.env.COUNTER_DEVICE_TOKEN;
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const session = await fetch(`http://127.0.0.1:${port}/api/session`);
    assert.equal(session.status, 503);
    const counter = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(counter.status, 503);
  } finally {
    process.env.JWT_SECRET = jwtSecret;
    process.env.COUNTER_DEVICE_TOKEN = deviceToken;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe rechazar conteos incompletos, sin lote estable o de cero billetes', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    for (const payload of [
      { dispositivo_id: 'CNT-001', cantidad_billetes: 1, lote_id: loteId(), fecha_hora: new Date().toISOString(), estado: 'contando' },
      { dispositivo_id: 'CNT-001', cantidad_billetes: 1, fecha_hora: new Date().toISOString(), estado: 'completado' },
      { dispositivo_id: 'CNT-001', cantidad_billetes: 0, lote_id: loteId(), fecha_hora: new Date().toISOString(), estado: 'completado' }
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 400);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/contador debe devolver el registro existente al reintentar el mismo lote', async () => {
  const id = loteId();
  let insertCount = 0;
  const saved = {
    id: 9,
    dispositivo_id: 'CNT-001',
    cantidad_billetes: 12,
    fecha_hora: new Date().toISOString(),
    created_at: new Date().toISOString(),
    lote_id: id
  };
  pool.query = async (sql) => {
    if (String(sql).includes('INSERT INTO contadores')) {
      insertCount += 1;
      return { rows: insertCount === 1 ? [saved] : [] };
    }
    if (String(sql).includes('FROM contadores')) return { rows: [saved] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();
  const payload = {
    dispositivo_id: 'CNT-001',
    cantidad_billetes: 12,
    fecha_hora: new Date().toISOString(),
    lote_id: id,
    estado: 'completado'
  };

  try {
    for (const expectedDuplicate of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.data.lote_id, id);
      assert.equal(Boolean(body.duplicate), expectedDuplicate);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/contador debe rechazar el reuso de un lote con una cantidad diferente', async () => {
  const id = loteId();
  pool.query = async (sql) => {
    if (String(sql).includes('INSERT INTO contadores')) return { rows: [] };
    if (String(sql).includes('FROM contadores')) {
      return { rows: [{ id: 9, dispositivo_id: 'CNT-001', cantidad_billetes: 12, lote_id: id }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id: 'CNT-001',
        cantidad_billetes: 13,
        fecha_hora: new Date().toISOString(),
        lote_id: id,
        estado: 'completado'
      })
    });
    assert.equal(response.status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/depositos/contador/validar calcula el importe en el servidor y limita la cuenta al usuario', async () => {
  const operationId = loteId();
  let accountOwner;
  pool.query = async (sql, params = []) => {
    const query = String(sql);
    if (query.includes('WHERE d.operacion_id = $1 AND c.usuario_id = $2')) return { rows: [] };
    if (query.includes('FROM cuentas WHERE numero_cuenta = $1 AND usuario_id = $2')) {
      accountOwner = params[1];
      return { rows: [{ id: 11, numero_cuenta: '1234567890' }] };
    }
    if (query.includes('FROM contadores')) {
      return { rows: [{ id: 21, dispositivo_id: 'CNT-001', cantidad_billetes: 20, created_at: new Date().toISOString() }] };
    }
    if (query.includes('INSERT INTO depositos')) {
      return { rows: [{
        operacion_id: params[0],
        cuenta_id: params[1],
        contador_id: params[2],
        denominacion: params[3],
        cantidad_billetes: params[4],
        importe: params[5],
        estado: 'pendiente',
        created_at: new Date().toISOString()
      }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/depositos/contador/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operationToken()}` },
      body: JSON.stringify({
        operacion_id: operationId,
        numero_cuenta: '1234567890',
        contador_id: 21,
        denominacion: 100,
        importe: 1
      })
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data.importe, 2000);
    assert.equal(accountOwner, 7);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/depositos/contador/validar rechaza una cuenta que no pertenece al usuario', async () => {
  const operationId = loteId();
  let queriedUserId;
  pool.query = async (sql, params = []) => {
    const query = String(sql);
    if (query.includes('WHERE d.operacion_id = $1 AND c.usuario_id = $2')) return { rows: [] };
    if (query.includes('FROM cuentas WHERE numero_cuenta = $1 AND usuario_id = $2')) {
      queriedUserId = params[1];
      return { rows: [] };
    }
    throw new Error(`Unexpected query in test: ${query}`);
  };

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/depositos/contador/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operationToken(19)}` },
      body: JSON.stringify({
        operacion_id: operationId,
        numero_cuenta: '1234567890',
        contador_id: 21,
        denominacion: 100
      })
    });
    assert.equal(response.status, 404);
    assert.equal(queriedUserId, 19);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('POST /api/depositos/contador/confirmar acredita y registra el movimiento una sola vez al reintentar', async () => {
  const operacionId = loteId();
  let state = 'pendiente';
  let creditCount = 0;
  let movementCount = 0;
  const deposit = () => ({
    operacion_id: operacionId,
    cuenta_id: 11,
    contador_id: 21,
    denominacion: 100,
    cantidad_billetes: 20,
    importe: '2000.00',
    estado: state,
    saldo_resultante: state === 'confirmado' ? '2500.00' : null,
    created_at: new Date().toISOString(),
    numero_cuenta: '1234567890',
    conteo_creado: new Date().toISOString()
  });
  const client = {
    async query(sql) {
      const query = String(sql);
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') return { rows: [] };
      if (query.includes('SELECT d.operacion_id')) return { rows: [deposit()] };
      if (query.includes('SELECT saldo FROM cuentas')) return { rows: [{ saldo: '500.00' }] };
      if (query.includes('UPDATE cuentas SET saldo')) {
        creditCount += 1;
        return { rows: [{ saldo: '2500.00' }] };
      }
      if (query.includes('INSERT INTO movimientos')) {
        movementCount += 1;
        return { rows: [] };
      }
      if (query.includes("SET estado = 'confirmado'")) {
        state = 'confirmado';
        return { rows: [{
          operacion_id: operacionId,
          estado: state,
          importe: '2000.00',
          saldo_resultante: '2500.00',
          confirmado_at: new Date().toISOString()
        }] };
      }
      throw new Error(`Unexpected query in test: ${query}`);
    },
    release() {}
  };
  pool.connect = async () => client;

  const server = app.listen(0);
  const { port } = server.address();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/depositos/contador/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operationToken()}` },
        body: JSON.stringify({ operacion_id: operacionId })
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.data.saldo, 2500);
    }
    assert.equal(creditCount, 1);
    assert.equal(movementCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.connect = originalConnect;
  }
});

test('POST /api/depositos/contador/confirmar revierte la transacción y no expone errores de PostgreSQL', async () => {
  const operacionId = loteId();
  let rolledBack = false;
  pool.connect = async () => ({
    async query(sql) {
      const query = String(sql);
      if (query === 'BEGIN') return { rows: [] };
      if (query === 'ROLLBACK') {
        rolledBack = true;
        return { rows: [] };
      }
      if (query.includes('SELECT d.operacion_id')) {
        return { rows: [{
          operacion_id: operacionId,
          cuenta_id: 11,
          contador_id: 21,
          denominacion: 100,
          cantidad_billetes: 20,
          importe: '2000.00',
          estado: 'pendiente',
          saldo_resultante: null,
          created_at: new Date().toISOString(),
          numero_cuenta: '1234567890',
          conteo_creado: new Date().toISOString()
        }] };
      }
      if (query.includes('SELECT saldo FROM cuentas')) return { rows: [{ saldo: '500.00' }] };
      if (query.includes('UPDATE cuentas SET saldo')) {
        throw new Error('sensitive PostgreSQL error with token and PIN');
      }
      throw new Error(`Unexpected query in test: ${query}`);
    },
    release() {}
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/depositos/contador/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operationToken()}` },
      body: JSON.stringify({ operacion_id: operacionId })
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.message, 'No se pudo confirmar el depósito.');
    assert.doesNotMatch(JSON.stringify(body), /sensitive PostgreSQL error|token|PIN/);
    assert.equal(rolledBack, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.connect = originalConnect;
  }
});

test('POST /api/depositos/contador/cancelar no actualiza el saldo', async () => {
  const operationId = loteId();
  let accountUpdateAttempted = false;
  pool.query = async (sql) => {
    const query = String(sql);
    if (query.includes('UPDATE cuentas')) accountUpdateAttempted = true;
    if (query.includes('UPDATE depositos')) return { rows: [{ operacion_id: operationId, estado: 'cancelado' }] };
    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/depositos/contador/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operationToken()}` },
      body: JSON.stringify({ operacion_id: operationId })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.estado, 'cancelado');
    assert.equal(accountUpdateAttempted, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('GET /api/movimientos requiere sesión y consulta solo el historial del usuario autenticado', async () => {
  let queriedUserId;
  pool.query = async (sql, params = []) => {
    if (String(sql).includes('FROM movimientos')) {
      queriedUserId = params[0];
      return { rows: [{ id: 1, tipo: 'deposito_contador', monto: '2000.00', descripcion: 'Depósito', created_at: new Date().toISOString() }] };
    }
    return { rows: [] };
  };

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/movimientos`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`http://127.0.0.1:${port}/api/movimientos`, {
      headers: { Authorization: `Bearer ${operationToken(31)}` }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(queriedUserId, 31);
    assert.equal(body.data[0].tipo, 'deposito_contador');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
});

test('la API rechaza JSON malformado y cuerpos que exceden el límite', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const malformed = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: '{"incompleto":'
    });

    test('POST /api/deposit fue retirado y no acepta datos de tarjeta del cliente', async () => {
      const server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));

      try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountNumber: '1234567890',
            cardNumber: '4111111111111111',
            nip: '1234',
            cvv: '123',
            amount: 100
          })
        });
        assert.equal(response.status, 404);
        assert.equal((await response.json()).message, 'Ruta no encontrada.');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    test('GET /health informa disponibilidad y oculta el detalle de errores de PostgreSQL', async () => {
      const originalQuery = pool.query;
      const server = app.listen(0);
      await new Promise((resolve) => server.once('listening', resolve));

      try {
        pool.query = async () => ({ rows: [{ '?column?': 1 }] });
        const healthy = await fetch(`http://127.0.0.1:${server.address().port}/health`);
        assert.equal(healthy.status, 200);
        assert.deepEqual(await healthy.json(), { success: true, status: 'ok' });

        pool.query = async () => {
          throw new Error('sensitive database connection detail');
        };
        const unavailable = await fetch(`http://127.0.0.1:${server.address().port}/health`);
        assert.equal(unavailable.status, 503);
        const body = await unavailable.json();
        assert.deepEqual(body, { success: false, status: 'unavailable' });
        assert.doesNotMatch(JSON.stringify(body), /sensitive database connection detail/);
      } finally {
        pool.query = originalQuery;
        await new Promise((resolve) => server.close(resolve));
      }
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, 'El cuerpo de la solicitud no contiene JSON válido.');

    const oversized = await fetch(`http://127.0.0.1:${port}/api/contador`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dato: 'x'.repeat(17 * 1024) })
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).message, 'La solicitud excede el tamaño permitido.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
