'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { after, before, test } = require('node:test');
const { createApp } = require('../server');
const { loadRuntimeConfig } = require('../config');
const database = require('../db');

let server;
let baseUrl;

before(async () => {
  const app = createApp({ nodeEnv: 'test', port: 0, allowedOrigins: ['https://allowed.example'] });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('legacy unauthenticated deliverable writes are unavailable', async () => {
  const response = await fetch(`${baseUrl}/api/epdg/deliverable-submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 503);
});

test('foundation modules are disabled unless explicitly enabled', async () => {
  const response = await fetch(`${baseUrl}/api/agency/booking-inquiries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 503);
});

test('public contributions require both publication and approved active profiles', async () => {
  const originalQuery = database.query;
  const originalFlag = process.env.PUBLIC_CREDITS_ENABLED;
  let capturedSql = '';

  database.query = async (sql) => {
    capturedSql = sql;
    return { rows: [] };
  };
  process.env.PUBLIC_CREDITS_ENABLED = 'true';

  try {
    const response = await fetch(`${baseUrl}/api/public-contributions`);
    assert.equal(response.status, 200);
    assert.match(capturedSql, /cf\.is_public\s*=\s*true/i);
    assert.match(capturedSql, /ip\.is_approved\s*=\s*true/i);
    assert.match(capturedSql, /u\.deleted_at\s+is\s+null/i);
  } finally {
    database.query = originalQuery;
    if (originalFlag === undefined) {
      delete process.env.PUBLIC_CREDITS_ENABLED;
    } else {
      process.env.PUBLIC_CREDITS_ENABLED = originalFlag;
    }
  }
});

test('foundation CORS is an explicit allowlist', async () => {
  const denied = await fetch(`${baseUrl}/`, {
    headers: { origin: 'https://denied.example' },
  });
  assert.equal(denied.status, 403);
  assert.equal(JSON.stringify(await denied.json()).includes('denied.example'), false);

  const allowed = await fetch(`${baseUrl}/`, {
    headers: { origin: 'https://allowed.example' },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
});

test('foundation unknown routes return JSON 404', async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, error: 'Route not found' });
});

test('foundation production configuration fails closed', () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production' }),
    /DATABASE_URL.*CORS_ALLOWED_ORIGINS/,
  );
});

test('foundation production database TLS cannot disable certificate verification', () => {
  assert.throws(
    () => loadRuntimeConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://example.invalid/database',
      CORS_ALLOWED_ORIGINS: 'https://frontend.example.invalid',
      DB_SSL: 'false',
    }),
    /cannot disable certificate verification/,
  );
  const databaseSource = readFileSync('db.js', 'utf8');
  assert.equal(databaseSource.includes('rejectUnauthorized: false'), false);
  assert.equal(databaseSource.includes('rejectUnauthorized: true'), true);
});

test('foundation production CORS rejects plaintext or path-bearing origins', () => {
  for (const origin of ['http://frontend.example.invalid', 'https://frontend.example.invalid/path']) {
    assert.throws(
      () => loadRuntimeConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://example.invalid/database',
        CORS_ALLOWED_ORIGINS: origin,
      }),
      /valid HTTPS origins/,
    );
  }
});

test('foundation database waits are bounded and timeout overrides are validated', () => {
  const databaseSource = readFileSync('db.js', 'utf8');
  assert.match(databaseSource, /connectionTimeoutMillis/);
  assert.match(databaseSource, /statement_timeout/);
  assert.throws(
    () => loadRuntimeConfig({ DB_CONNECTION_TIMEOUT_MS: '0' }),
    /DB_CONNECTION_TIMEOUT_MS/,
  );
});
