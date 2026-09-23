const { Pool } = require('pg');

// Permitir un fallback a parámetros locales si no existe DATABASE_URL
const connectionString = process.env.DATABASE_URL || null;

const poolConfig = {};
if (connectionString) {
    poolConfig.connectionString = connectionString;
    poolConfig.ssl = { rejectUnauthorized: false };
} else {
    // Valores por defecto para desarrollo local (Postgres en localhost)
    poolConfig.user = process.env.PGUSER || 'postgres';
    poolConfig.host = process.env.PGHOST || '127.0.0.1';
    poolConfig.database = process.env.PGDATABASE || 'banco_dev';
    poolConfig.password = process.env.PGPASSWORD || '';
    poolConfig.port = Number(process.env.PGPORT || 5432);
}

const pool = new Pool(poolConfig);

module.exports = pool;