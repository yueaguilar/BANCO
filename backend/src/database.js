const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || null;

const poolConfig = {};
if (connectionString) {
    poolConfig.connectionString = connectionString;
    poolConfig.ssl = { rejectUnauthorized: false };
} else {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL debe estar configurado en producción.');
    }
    poolConfig.user = process.env.PGUSER || 'postgres';
    poolConfig.host = process.env.PGHOST || '127.0.0.1';
    poolConfig.database = process.env.PGDATABASE || 'banco_dev';
    poolConfig.password = process.env.PGPASSWORD || '';
    poolConfig.port = Number(process.env.PGPORT || 5432);
}

const pool = new Pool(poolConfig);

module.exports = pool;