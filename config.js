'use strict';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function loadRuntimeConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const port = env.PORT ? Number(env.PORT) : 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  for (const timeoutName of ['DB_CONNECTION_TIMEOUT_MS', 'DB_STATEMENT_TIMEOUT_MS']) {
    const value = env[timeoutName];
    if (value && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 120000)) {
      throw new Error(`${timeoutName} must be an integer between 1 and 120000.`);
    }
  }

  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (nodeEnv === 'production') {
    const required = ['DATABASE_URL', 'CORS_ALLOWED_ORIGINS'];
    const missing = required.filter((name) => !hasValue(env[name]));
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    if (env.DB_SSL === 'false') {
      throw new Error('DB_SSL cannot disable certificate verification in production.');
    }
    for (const origin of allowedOrigins) {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error('CORS_ALLOWED_ORIGINS entries must be valid HTTPS origins.');
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error('CORS_ALLOWED_ORIGINS entries must be valid HTTPS origins.');
      }
    }
  }

  return { nodeEnv, port, allowedOrigins };
}

module.exports = { loadRuntimeConfig };
