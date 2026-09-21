require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const email = process.argv[2] || 'test+1@example.com';
const mode = process.argv[2] || 'user';
const target = process.argv[3] || email;
const extra = process.argv[4];
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    if (mode === 'info') {
      const res = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='tarjetas' ORDER BY ordinal_position");
      console.log(JSON.stringify(res.rows, null, 2));
    } else if (mode === 'setnip') {
      // setnip <id> <nip>  (solo se guarda el hash, nunca el NIP en claro)
      const id = Number(target);
      const nipVal = String(extra || '0000');
      const nipHash = await bcrypt.hash(nipVal, 10);
      await pool.query('UPDATE tarjetas SET nip_hash=$1 WHERE id=$2', [nipHash, id]);
      const r = await pool.query('SELECT id,numero_tarjeta,nip_hash FROM tarjetas WHERE id=$1', [id]);
      console.log(JSON.stringify(r.rows, null, 2));
    } else if (mode === 'listcards') {
      const r = await pool.query('SELECT id,cuenta_id,numero_tarjeta,mes_expiracion,anio_expiracion,nip_hash,created_at FROM tarjetas ORDER BY id');
      console.log(JSON.stringify(r.rows, null, 2));
    } else {
      const res = await pool.query(
        `SELECT u.id,u.fullname,u.email,c.id as cuenta_id,c.numero_cuenta,t.id as tarjeta_id,t.numero_tarjeta,t.nip_hash
         FROM users u
         LEFT JOIN cuentas c ON c.usuario_id = u.id
         LEFT JOIN tarjetas t ON t.cuenta_id = c.id
         WHERE u.email = $1`,
        [target]
      );
      console.log(JSON.stringify(res.rows, null, 2));
    }
  } catch (err) {
    console.error('DB query error:', err);
  } finally {
    await pool.end();
  }
})();