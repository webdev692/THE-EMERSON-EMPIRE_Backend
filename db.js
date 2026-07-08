const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database-backed routes will fail until it is configured.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
    console.error('Database query error:', error.message);
    throw error;
  }
}

async function checkDatabase() {
  if (!connectionString) {
    return { configured: false, ok: false, message: 'DATABASE_URL is not configured.' };
  }

  try {
    const result = await query('select now() as checked_at');
    return { configured: true, ok: true, checkedAt: result.rows[0].checked_at };
  } catch (error) {
    return { configured: true, ok: false, message: error.message };
  }
}

module.exports = { query, pool, checkDatabase };
