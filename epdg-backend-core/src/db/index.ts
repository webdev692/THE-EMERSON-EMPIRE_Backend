import { Pool, PoolClient } from "pg";
import { migrate } from "postgres-migrations";
import path from "path";

let pool: Pool | null = null;

function getSslConfig() {
  if (process.env.DB_SSL === "true") {
    return { rejectUnauthorized: false };
  }

  if (process.env.DB_SSL === "false") {
    return false;
  }

  if (
    process.env.NODE_ENV === "production" ||
    process.env.DB_HOST?.includes("supabase.com")
  ) {
    return { rejectUnauthorized: false };
  }

  return false;
}

export function getPool(): Pool {
  if (!pool) {
    const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }

    const dbConfig = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: getSslConfig(),
    };

    pool = new Pool(dbConfig);
  }
  return pool;
}

export async function testConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
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

export async function performMigration() {
  const client = await getPool().connect();
  const migrationsPath = path.join(__dirname, "migrations");

  try {
    await ensureMigrationTable(client);
    console.info("Starting database migration...");
    await migrate({ client }, migrationsPath);
    console.info("Database migration completed successfully.");
  } catch (e: any) {
    console.error("Error occurred while migrating:", e);
    throw e;
  } finally {
    client.release();
  }
}
