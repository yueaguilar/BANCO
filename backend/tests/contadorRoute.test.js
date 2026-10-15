const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const pool = require('../src/database');

const originalQuery = pool.query.bind(pool);

test('POST /api/contador debe validar datos y guardar el registro', async () => {
  pool.query = async (sql, params = []) => {
    if (String(sql).includes('INSERT INTO contadores')) {
      return { rows: [{ id: 1, dispositivo_id: params[0], cantidad_billetes: params[1], fecha_hora: params[2] }] };
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
