import { Pool, PoolClient } from 'pg';
import { migrate } from 'postgres-migrations';
import path from 'path';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

function getSslConfig() {
  if (process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: true };
  }
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DB_HOST?.endsWith('.supabase.com') ||
    process.env.DB_HOST?.endsWith('.supabase.co')
  ) {
    return { rejectUnauthorized: true };
  }
  return false;
}

export function getPool(): Pool {
  if (!pool) {
    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: getSslConfig(),
      options: '-c search_path=epdg,public',
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15000),
    });
  }
  return pool;
}

export async function testConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.migrations (
      id integer PRIMARY KEY,
      name varchar(100) UNIQUE NOT NULL,
      hash varchar(40) NOT NULL,
      executed_at timestamp DEFAULT current_timestamp
    );
  `);
}

/**
 * Manual-only migration entrypoint. Application startup never calls this.
 * Hash mismatches are intentionally fatal: migration history is evidence and
 * must not be erased or replayed automatically.
 */
export async function performMigration(): Promise<void> {
  if (process.env.ALLOW_DATABASE_MIGRATIONS !== 'true') {
    throw new Error(
      'Database migrations are disabled. Set ALLOW_DATABASE_MIGRATIONS only after the migration set is reviewed.',
    );
  }

  const client = await getPool().connect();
  const migrationsPath = path.join(__dirname, 'migrations');

  try {
    await ensureMigrationTable(client);
    logger.info('Starting reviewed database migration');
    await migrate({ client }, migrationsPath);
    logger.success('Database migration completed');
  } catch (error) {
    logger.error('Database migration failed', error);
    throw error;
  } finally {
    client.release();
  }
}
