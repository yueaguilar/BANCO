require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    // get a cuenta id to attach to
    const cuentas = await pool.query('SELECT id FROM cuentas ORDER BY id DESC LIMIT 1');
    if (cuentas.rows.length === 0) {
      console.log('No hay cuentas en la DB para usar');
      return;
    }
    const cuentaId = cuentas.rows[0].id;
    const numeroTarjeta = Array.from({length:16}, ()=>crypto.randomInt(0,10)).join('');
    const nip = '7777';
    const nipHash = await bcrypt.hash(nip,10);
    const mes = 12;
    const anio = 30;

    const res = await pool.query('INSERT INTO tarjetas (cuenta_id, numero_tarjeta, mes_expiracion, anio_expiracion, nip, nip_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [cuentaId, numeroTarjeta, mes, anio, nip, nipHash]);
    console.log('Inserted tarjeta:', res.rows[0]);

    const sel = await pool.query('SELECT id,numero_tarjeta,nip,nip_hash FROM tarjetas WHERE id=$1', [res.rows[0].id]);
    console.log('Selected:', sel.rows[0]);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
