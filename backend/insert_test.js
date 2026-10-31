require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
  });
  try {
    // get a cuenta id to attach to
    const cuentas = await pool.query('SELECT id FROM cuentas ORDER BY id DESC LIMIT 1');
    if (cuentas.rows.length === 0) {
      console.log('No hay cuentas en la DB para usar');
      return;
    }
    const cuentaId = cuentas.rows[0].id;
    const numeroTarjeta = Array.from({length:16}, ()=>crypto.randomInt(0,10)).join('');
    const nipHash = await bcrypt.hash(String(crypto.randomInt(1000, 10000)), 10);
    const mes = 12;
    const anio = 30;

    const res = await pool.query(
      'INSERT INTO tarjetas (cuenta_id, numero_tarjeta, mes_expiracion, anio_expiracion, nip_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [cuentaId, numeroTarjeta, mes, anio, nipHash]
    );
    console.log('Tarjeta de prueba creada con ID:', res.rows[0].id);
  } catch (err) {
    console.error('Error:', err?.code || err?.name || 'unknown');
  } finally {
    await pool.end();
  }
})();
