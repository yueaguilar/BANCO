const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const pool = require('../src/database');

const originalQuery = pool.query.bind(pool);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'CNT-001',
        cantidad_billetes: 125,
        fecha_hora: '2026-10-15T10:30:00.000Z'
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad_billetes: 10 })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /identificador del dispositivo es obligatorio/i);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: -3
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /número entero mayor o igual a cero/i);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /número entero mayor o igual a cero/i);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 'abc'
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /número entero mayor o igual a cero/i);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 12.5
      })
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /número entero mayor o igual a cero/i);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 10,
        fecha_hora: 'fecha-no-válida'
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispositivo_id: 'contador-arduino-01',
        cantidad_billetes: 10,
        fecha_hora: '2026-10-15T10:30:00.000Z'
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
