export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  nodeEnv: RuntimeEnvironment;
  port: number;
}

const CORE_REQUIRED_VARIABLES = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'FRONTEND_URL',
  'RESEND_API_KEY',
  'SMTP_FROM',
  'SUPABASE_URL',
  'CERT_SIGNING_SECRET',
] as const;

const PRODUCTION_REQUIRED_VARIABLES = [
  'CORS_ORIGINS',
] as const;

function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readNodeEnvironment(value: string | undefined): RuntimeEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'test' || value === 'production') return value;
  throw new Error('NODE_ENV must be development, test, or production.');
}

function readPort(value: string | undefined): number {
  const port = value ? Number(value) : 8000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function validateHttpUrl(
  name: string,
  value: string | undefined,
  httpsOnly = false,
): void {
  if (!hasValue(value)) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if (httpsOnly && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

function validateOrigin(name: string, value: string, httpsOnly: boolean): void {
  validateHttpUrl(name, value, httpsOnly);
  const parsed = new URL(value);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(`${name} entries must be origins without paths, credentials, queries, or fragments.`);
  }
}

export function requireEnvironmentVariable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name];
  if (!hasValue(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const nodeEnv = readNodeEnvironment(env.NODE_ENV);
  const required = [
    ...CORE_REQUIRED_VARIABLES,
    ...(nodeEnv === 'production' ? PRODUCTION_REQUIRED_VARIABLES : []),
  ];
  const missing = required.filter((name) => !hasValue(env[name]));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }

  const certificateSecret = env.CERT_SIGNING_SECRET ?? '';
  if (certificateSecret.length < 32) {
    throw new Error('CERT_SIGNING_SECRET must be at least 32 characters.');
  }

  const production = nodeEnv === 'production';
  validateHttpUrl('FRONTEND_URL', env.FRONTEND_URL, production);
  validateHttpUrl('SUPABASE_URL', env.SUPABASE_URL, production);

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) validateOrigin('CORS_ORIGINS', origin, production);

  if (env.DB_PORT && (!Number.isInteger(Number(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535)) {
    throw new Error('DB_PORT must be an integer between 1 and 65535.');
  }

  for (const timeoutName of ['DB_CONNECTION_TIMEOUT_MS', 'DB_STATEMENT_TIMEOUT_MS']) {
    const value = env[timeoutName];
    if (value && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 120_000)) {
      throw new Error(`${timeoutName} must be an integer between 1 and 120000.`);
    }
  }

  if (nodeEnv === 'production' && env.DB_SSL === 'false') {
    throw new Error('DB_SSL cannot disable certificate verification in production.');
  }

  return {
    nodeEnv,
    port: readPort(env.PORT),
  };
}
