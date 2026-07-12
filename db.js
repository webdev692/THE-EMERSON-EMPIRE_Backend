const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('Database configuration is unavailable.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true }
    : false,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
});

async function query(text, params = []) {
  const startedAt = Date.now();

  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - startedAt;

    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { durationMs, rows: result.rowCount });
    }

    return result;
  } catch (error) {
    console.error('Database query failed', { errorType: error.name || 'Error' });
    throw error;
  }
}

async function checkDatabase() {
  if (!connectionString) {
    return { configured: false, ok: false };
  }

  try {
    const result = await query('select now() as checked_at');
    return { configured: true, ok: true };
  } catch (error) {
    return { configured: true, ok: false };
  }
}

module.exports = { query, pool, checkDatabase };
