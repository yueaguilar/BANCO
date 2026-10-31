require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const email = process.argv[2] || 'test+1@example.com';
const mode = process.argv[2] || 'user';
const target = process.argv[3] || email;
const extra = process.argv[4];
(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
  });
  try {
    if (mode === 'info') {
      const res = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='tarjetas' ORDER BY ordinal_position");
      console.log(JSON.stringify(res.rows, null, 2));
    } else if (mode === 'setnip') {
      // setnip <id> <nip> (solo se guarda el hash, nunca el NIP en claro)
      const id = Number(target);
      const nipVal = String(extra || '');
      if (!Number.isSafeInteger(id) || id <= 0 || !/^\d{4}$/.test(nipVal)) {
        throw new Error('setnip requiere un ID válido y un NIP de cuatro dígitos.');
      }
      const nipHash = await bcrypt.hash(nipVal, 10);
      await pool.query('UPDATE tarjetas SET nip_hash=$1 WHERE id=$2', [nipHash, id]);
      const r = await pool.query('SELECT id, RIGHT(numero_tarjeta, 4) AS tarjeta_ultimos4 FROM tarjetas WHERE id=$1', [id]);
      console.log(JSON.stringify(r.rows, null, 2));
    } else if (mode === 'listcards') {
      const r = await pool.query(`
        SELECT id, cuenta_id, RIGHT(numero_tarjeta, 4) AS tarjeta_ultimos4,
               mes_expiracion, anio_expiracion, created_at
        FROM tarjetas
        ORDER BY id
      `);
      console.log(JSON.stringify(r.rows, null, 2));
    } else {
      const res = await pool.query(
        `SELECT u.id, u.fullname, u.email, c.id AS cuenta_id,
                RIGHT(c.numero_cuenta, 4) AS cuenta_ultimos4, t.id AS tarjeta_id,
                RIGHT(t.numero_tarjeta, 4) AS tarjeta_ultimos4
         FROM users u
         LEFT JOIN cuentas c ON c.usuario_id = u.id
         LEFT JOIN tarjetas t ON t.cuenta_id = c.id
         WHERE u.email = $1`,
        [target]
      );
      console.log(JSON.stringify(res.rows, null, 2));
    }
  } catch (err) {
    console.error('DB query error:', err?.code || err?.name || 'unknown');
  } finally {
    await pool.end();
  }
})();