'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';

const { createApp } = require('../dist/app.js');
const { validateEnvironment } = require('../dist/config/env.js');
const databaseModule = require('../dist/db/index.js');
const { sanitizeServerErrors } = require('../dist/middlewares/sanitizeServerErrors.js');
const { AdminService } = require('../dist/services/AdminService.js');
const { AuthService } = require('../dist/services/AuthService.js');
const { isAllowedCvUrl } = require('../dist/utils/cvParser.js');
const { escapeHtml, sanitizeEmailSubject } = require('../dist/utils/emailSafety.js');
const { authMiddleware, mentorGuard, roleGuard } = require('../dist/middlewares/auth.js');

let server;
let baseUrl;

before(async () => {
  const app = createApp({ readinessCheck: async () => undefined });
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

test('health returns a privacy-safe database-ready response', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: 'epdg-backend-core',
    status: 'ok',
  });
});

test('protected route namespaces reject unauthenticated requests with 401', async () => {
  for (const path of [
    '/api/admin/stats',
    '/api/admin/applications',
    '/api/admin/certificates',
    '/api/admin/resources',
    '/api/admin/opportunities',
    '/api/admin/feedback',
    '/api/admin/gamification/leaderboard',
    '/api/intern/dashboard',
    '/api/intern/applications',
    '/api/intern/tasks',
    '/api/intern/submissions',
    '/api/intern/progress/stats',
    '/api/intern/feedback/received',
    '/api/intern/leaderboard',
    '/api/intern/career-file',
    '/api/mentor/stats',
    '/api/users',
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, path);
  }
});

test('public registration cannot create administrator accounts', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Account',
      email: 'test-account@example.invalid',
      password: 'safe-test-password',
      role: 'admin',
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
});

test('validation responses never echo password values', async () => {
  const password = 'p@ss';
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Validation Test',
      email: 'validation-test@example.invalid',
      password,
      role: 'intern',
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes(password), false);
  assert.equal(JSON.stringify(body).includes('value'), false);
});

test('auth controllers classify unexpected failures as sanitized 5xx responses', () => {
  const source = readFileSync('src/controllers/AuthController.ts', 'utf8');
  assert.match(source, /\['Invalid access token', 'User not found', 'User role not found'\]/);
  assert.match(source, /\['Invalid verification token', 'Verification token has expired'\]/);
  assert.match(source, /\['Invalid or expired reset token', 'Invalid reset token', 'User not found'\]/);
  assert.ok((source.match(/message: 'Internal server error'/g) ?? []).length >= 4);
});

async function authenticateWithToken(token) {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  await authMiddleware(request, response, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
}

test('password-reset JWTs cannot authenticate or mint access tokens', async () => {
  const resetToken = jwt.sign(
    { id: 41, purpose: 'password_reset' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '30m' },
  );

  const authResult = await authenticateWithToken(resetToken);
  assert.equal(authResult.statusCode, 401);
  assert.equal(authResult.nextCalled, false);
  assert.equal(authResult.body.message, 'Invalid or expired token');

  await assert.rejects(
    () => new AuthService().refreshToken(resetToken),
    /Invalid access token/,
  );
});

test('access JWTs use an explicit purpose and reject alternate HMAC algorithms', async () => {
  const authService = new AuthService();
  const accessToken = authService.generateToken(
    { id: 41, email: 'access-token-test@example.invalid' },
    'intern',
  );
  const decoded = jwt.verify(accessToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(decoded.purpose, 'access');
  assert.ok(decoded.exp - decoded.iat <= 60 * 60);

  const alternateAlgorithmToken = jwt.sign(
    { id: 41, purpose: 'access' },
    process.env.JWT_SECRET,
    { algorithm: 'HS512', expiresIn: '30m' },
  );
  const authResult = await authenticateWithToken(alternateAlgorithmToken);
  assert.equal(authResult.statusCode, 401);
  assert.equal(authResult.nextCalled, false);
});

test('the HTTP token-refresh exchange remains disabled without revocation state', () => {
  const routes = readFileSync('src/routes/authRoutes.ts', 'utf8');
  assert.match(routes, /Token refresh is unavailable until rotating revocation state is configured/);
  assert.equal(routes.includes('AuthController.refreshToken'), false);
});

async function authenticateDatabaseRow(row) {
  const originalGetPool = databaseModule.getPool;
  const request = {
    headers: {
      authorization: `Bearer ${jwt.sign(
        { id: row.id, purpose: 'access' },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '30m' },
      )}`,
    },
  };
  let nextCalled = false;
  let statusCode = 200;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  databaseModule.getPool = () => ({
    query: async () => ({ rows: [row], rowCount: 1 }),
  });
  try {
    await authMiddleware(request, response, () => { nextCalled = true; });
  } finally {
    databaseModule.getPool = originalGetPool;
  }
  return { nextCalled, statusCode, user: request.user };
}

test('live rejection state wins over stale profile approval', async () => {
  const result = await authenticateDatabaseRow({
    id: 41,
    email: 'rejected-account@example.invalid',
    is_verified: true,
    role_name: 'company',
    admin_role: null,
    core_rejection_reason: 'Not approved',
    epdg_rejection_reason: null,
    company_approved: true,
    school_approved: null,
    intern_approved: null,
    intern_rejection_reason: null,
    admin_profile_id: null,
    is_mentor: null,
    force_password_change: null,
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.user.status, 'rejected');
});

test('verified admin identities without an admin profile fail closed as pending', async () => {
  const result = await authenticateDatabaseRow({
    id: 42,
    email: 'incomplete-admin@example.invalid',
    is_verified: true,
    role_name: 'admin',
    admin_role: 'admin',
    core_rejection_reason: null,
    epdg_rejection_reason: null,
    company_approved: null,
    school_approved: null,
    intern_approved: null,
    intern_rejection_reason: null,
    admin_profile_id: null,
    is_mentor: null,
    force_password_change: null,
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.user.status, 'pending');
  assert.equal(guardResult(roleGuard('admin'), result.user).statusCode, 403);
  const authService = readFileSync('src/services/AuthService.ts', 'utf8');
  const loginStart = authService.indexOf('async login(');
  const loginEnd = authService.indexOf('async changePassword(', loginStart);
  const login = authService.slice(loginStart, loginEnd);
  assert.match(login, /let status = branchRole\.rejection_reason \? 'rejected' : 'pending'/);
  assert.equal(login.includes("let status = 'approved'"), false);
});

test('unknown routes return the JSON error envelope', async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Route not found',
    errors: [],
  });
});

test('disallowed browser origins receive a privacy-safe 403', async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'https://not-allowed.example' },
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.message, 'Origin is not allowed');
  assert.equal(JSON.stringify(body).includes('not-allowed.example'), false);
});

test('readiness errors do not expose internal error messages', async () => {
  const failingApp = createApp({
    readinessCheck: async () => {
      throw new Error('private database connection detail');
    },
  });
  const failingServer = await new Promise((resolve) => {
    const listener = failingApp.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = failingServer.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  await new Promise((resolve, reject) => failingServer.close((error) => error ? reject(error) : resolve()));

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes('private database'), false);
  assert.deepEqual(body, {
    success: false,
    message: 'Service unavailable',
    errors: [],
    service: 'epdg-backend-core',
    status: 'unavailable',
  });
});

test('the response boundary sanitizes direct controller 5xx bodies', () => {
  let sent;
  const response = {
    statusCode: 500,
    json(body) {
      sent = body;
      return this;
    },
  };

  sanitizeServerErrors({}, response, () => undefined);
  response.json({
    success: false,
    message: 'private SQL detail',
    error: 'provider detail',
    detail: 'filesystem path',
    stack: 'private stack',
    data: { private: true },
  });
  assert.deepEqual(sent, {
    success: false,
    message: 'Internal server error',
    errors: [],
  });
});

test('production environment validation fails closed by variable name only', () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: 'production' }),
    /DB_HOST.*JWT_SECRET.*CORS_ORIGINS/,
  );
});

test('production database TLS cannot disable certificate verification', () => {
  const productionEnvironment = {
    NODE_ENV: 'production',
    DB_HOST: 'database.example.invalid',
    DB_NAME: 'database',
    DB_USER: 'backend',
    DB_PASSWORD: 'test-only-password',
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: 'https://frontend.example.invalid',
    RESEND_API_KEY: 'test-only-provider-key',
    SMTP_FROM: 'sender@example.invalid',
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
    CERT_SIGNING_SECRET: 'test-only-certificate-signing-secret',
    CORS_ORIGINS: 'https://frontend.example.invalid',
    DB_SSL: 'false',
  };
  assert.throws(
    () => validateEnvironment(productionEnvironment),
    /cannot disable certificate verification/,
  );
  const databaseSource = readFileSync('src/db/index.ts', 'utf8');
  assert.equal(databaseSource.includes('rejectUnauthorized: false'), false);
});

test('production URLs, CORS origins, and signing secrets fail closed', () => {
  const baseEnvironment = {
    NODE_ENV: 'production',
    DB_HOST: 'database.example.invalid',
    DB_NAME: 'database',
    DB_USER: 'backend',
    DB_PASSWORD: 'test-only-password',
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: 'https://frontend.example.invalid',
    RESEND_API_KEY: 'test-only-provider-key',
    SMTP_FROM: 'sender@example.invalid',
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
    CERT_SIGNING_SECRET: 'test-only-certificate-signing-secret',
    CORS_ORIGINS: 'https://frontend.example.invalid',
  };

  assert.throws(
    () => validateEnvironment({ ...baseEnvironment, FRONTEND_URL: 'http://frontend.example.invalid' }),
    /must use HTTPS/,
  );
  assert.throws(
    () => validateEnvironment({ ...baseEnvironment, CORS_ORIGINS: 'https://frontend.example.invalid/path' }),
    /must be origins/,
  );
  assert.throws(
    () => validateEnvironment({ ...baseEnvironment, CERT_SIGNING_SECRET: 'too-short' }),
    /at least 32 characters/,
  );
  assert.throws(
    () => validateEnvironment({ ...baseEnvironment, DB_CONNECTION_TIMEOUT_MS: '0' }),
    /DB_CONNECTION_TIMEOUT_MS/,
  );
  const databaseSource = readFileSync('src/db/index.ts', 'utf8');
  assert.match(databaseSource, /connectionTimeoutMillis/);
  assert.match(databaseSource, /statement_timeout/);
});

test('CV parsing permits only the configured Supabase storage origin', () => {
  const storageOrigin = 'https://project-ref.supabase.co';
  assert.equal(
    isAllowedCvUrl(
      `${storageOrigin}/storage/v1/object/sign/cv-uploads/example.pdf?token=redacted`,
      storageOrigin,
    ),
    true,
  );
  assert.equal(
    isAllowedCvUrl('http://127.0.0.1/internal', storageOrigin),
    false,
  );
  assert.equal(
    isAllowedCvUrl('https://untrusted.example/cv.pdf', storageOrigin),
    false,
  );
});

test('email content escapes HTML and strips subject-header line breaks', () => {
  assert.equal(
    escapeHtml('<a href="https://attacker.invalid">Click</a> & more'),
    '&lt;a href=&quot;https://attacker.invalid&quot;&gt;Click&lt;/a&gt; &amp; more',
  );
  assert.equal(sanitizeEmailSubject('Approved\r\nBcc: attacker@example.invalid'), 'Approved Bcc: attacker@example.invalid');

  const adminSource = readFileSync('src/services/AdminService.ts', 'utf8');
  const applicationSource = readFileSync('src/services/ApplicationService.ts', 'utf8');
  assert.match(adminSource, /subject: sanitizeEmailSubject\(subject\)/);
  assert.match(applicationSource, /subject: sanitizeEmailSubject\(subject\)/);
  assert.match(applicationSource, /safeInternName = escapeHtml/);
});

test('application startup cannot execute or rewrite migration history', () => {
  const startup = readFileSync('src/index.ts', 'utf8');
  const database = readFileSync('src/db/index.ts', 'utf8');
  assert.equal(startup.includes('performMigration'), false);
  assert.equal(database.includes('DELETE FROM public.migrations'), false);
  assert.equal(database.includes("ALLOW_DATABASE_MIGRATIONS !== 'true'"), true);
});

test('unowned private-file and unversioned legal workflows remain fail-closed', () => {
  const internRoutes = readFileSync('src/routes/internRoutes.ts', 'utf8');
  const uploadRoutes = readFileSync('src/routes/uploadRoutes.ts', 'utf8');
  const adminRoutes = readFileSync('src/routes/adminRoutes.ts', 'utf8');

  for (const feature of [
    "unavailable('Agreement acceptance')",
    "unavailable('Legacy onboarding completion')",
    "unavailable('Private submission upload')",
    "unavailable('Private submission delivery')",
    "unavailable('Private resubmission delivery')",
    "unavailable('Intern session feedback')",
  ]) {
    assert.equal(internRoutes.includes(feature), true, feature);
  }
  assert.equal(uploadRoutes.includes("router.post('/cv', uploadLimiter"), true);
  assert.equal(uploadRoutes.includes('upload.single'), false);
  const authService = readFileSync('src/services/AuthService.ts', 'utf8');
  const registerStart = authService.indexOf('async register(');
  const registerEnd = authService.indexOf('async login(', registerStart);
  const register = authService.slice(registerStart, registerEnd);
  assert.equal(register.includes('data.cv_url'), false);
  assert.equal(register.includes('contact_phone, cv_url, cover_letter'), false);
  assert.match(adminRoutes, /Certificate issuance is temporarily unavailable/);
  assert.equal(adminRoutes.includes("router.post('/certificates',                  CertificateController.issue)"), false);
});

test('generic profile updates cannot bypass onboarding or drift identity mirrors', () => {
  const controller = readFileSync('src/controllers/InternController.ts', 'utf8');
  const service = readFileSync('src/services/InternService.ts', 'utf8');
  const start = service.indexOf('async updateProfile(');
  const end = service.indexOf('// ─── Dashboard', start);
  const method = service.slice(start, end);

  assert.match(controller, /workflowControlledFields = \['track', 'cv_url', 'nda_signed', 'disclaimer_accepted'\]/);
  assert.equal(method.includes('track:                data.track'), false);
  assert.equal(method.includes('cv_url:               data.cv_url'), false);
  assert.equal(method.includes('nda_signed:           data.nda_signed'), false);
  assert.equal(method.includes('disclaimer_accepted:  data.disclaimer_accepted'), false);
  assert.match(method, /UPDATE core\.users SET name/);
  assert.match(method, /UPDATE epdg\.users SET name/);
  assert.match(method, /Identity synchronization failed/);
});

test('public career passports require a currently approved active intern', () => {
  const source = readFileSync('src/services/CareerFileService.ts', 'utf8');
  const passportStart = source.indexOf('async getPublicPassport(');
  const searchStart = source.indexOf('async searchInterns(', passportStart);
  const passport = source.slice(passportStart, searchStart);
  const search = source.slice(searchStart);

  assert.match(passport, /ip\.is_approved = TRUE/);
  assert.match(passport, /u\.deleted_at IS NULL/);
  assert.match(search, /ip\.is_approved = TRUE/);
  assert.match(search, /u\.deleted_at IS NULL/);
});

test('authenticated feedback identity is derived from the database user', () => {
  const controller = readFileSync('src/controllers/InternController.ts', 'utf8');
  const service = readFileSync('src/services/InternService.ts', 'utf8');
  const start = service.indexOf('async submitFeedback(');
  const end = service.indexOf('async getReceivedFeedback(', start);
  const method = service.slice(start, end);

  assert.equal(controller.includes('comment, name'), false);
  assert.equal(method.includes('data.name'), false);
  assert.match(method, /CASE WHEN \$1::boolean THEN 'Anonymous' ELSE u\.name END/);
  assert.match(method, /WHERE u\.id = \$5 AND u\.deleted_at IS NULL/);
});

test('admin school summaries preserve phone and city without inventing country data', () => {
  const source = readFileSync('src/services/AdminService.ts', 'utf8');
  assert.match(source, /s\.contact_phone\s+AS school_phone/);
  assert.match(source, /phone:\s+r\.intern_phone\s+\|\| r\.school_phone \|\| null/);
  assert.match(source, /city:\s+r\.school_city\s+\|\| null/);
});

test('every app-managed identity mirror write uses the transaction boundary', () => {
  const source = readFileSync('src/services/AuthService.ts', 'utf8');
  const methodRanges = [
    ['async login(', 'async changePassword('],
    ['async changePassword(', 'async refreshToken('],
    ['async verifyEmail(', 'async resendVerification('],
    ['async resendVerification(', 'async forgotPassword('],
    ['async resetPassword(', 'async getMe('],
  ];

  for (const [startMarker, endMarker] of methodRanges) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, startMarker);
    assert.notEqual(end, -1, endMarker);
    assert.match(source.slice(start, end), /await withTransaction\(/, startMarker);
  }
});

async function runVerifyEmailScenario(mirrorResult) {
  const originalGetPool = databaseModule.getPool;
  const commands = [];
  let released = false;
  let caught;

  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      commands.push(normalized);
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (normalized.startsWith('UPDATE core.users')) {
        return { rows: [{ id: 41 }], rowCount: 1 };
      }
      if (normalized.startsWith('UPDATE epdg.users')) {
        if (mirrorResult instanceof Error) throw mirrorResult;
        return mirrorResult;
      }
      throw new Error('Unexpected transaction query in test');
    },
    release() {
      released = true;
    },
  };

  const pool = {
    async query(sql) {
      assert.match(String(sql), /SELECT cu\.\*/);
      return {
        rows: [{ id: 41, token_expires_at: new Date(Date.now() + 60_000) }],
        rowCount: 1,
      };
    },
    async connect() {
      return client;
    },
  };

  databaseModule.getPool = () => pool;
  try {
    await new AuthService().verifyEmail('opaque-test-token');
  } catch (error) {
    caught = error;
  } finally {
    databaseModule.getPool = originalGetPool;
  }
  return { caught, commands, released };
}

test('identity mirror write failure rolls back the core write', async () => {
  const failure = new Error('simulated mirror update failure');
  const { caught, commands, released } = await runVerifyEmailScenario(failure);
  assert.equal(caught, failure);
  assert.deepEqual(commands.map((command) => command.split(' ')[0]), [
    'BEGIN', 'UPDATE', 'UPDATE', 'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('missing mirror row fails closed and rolls the transaction back', async () => {
  const { caught, commands, released } = await runVerifyEmailScenario(
    { rows: [], rowCount: 0 },
  );
  assert.match(caught?.message ?? '', /Identity synchronization failed/);
  assert.deepEqual(commands.map((command) => command.split(' ')[0]), [
    'BEGIN', 'UPDATE', 'UPDATE', 'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('admin identity deletion rolls back when the core mirror is missing', async () => {
  const originalGetPool = databaseModule.getPool;
  const commands = [];
  let released = false;
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      commands.push(normalized);
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (normalized.startsWith('UPDATE epdg.users')) {
        return { rows: [{ id: 41 }], rowCount: 1 };
      }
      if (normalized.startsWith('UPDATE core.users')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error('Unexpected deletion query in test');
    },
    release() {
      released = true;
    },
  };

  databaseModule.getPool = () => ({ connect: async () => client });
  try {
    await assert.rejects(
      () => new AdminService().deleteUser(41),
      /Core user deletion failed/,
    );
  } finally {
    databaseModule.getPool = originalGetPool;
  }

  assert.deepEqual(commands.map((command) => command.split(' ')[0]), [
    'BEGIN', 'UPDATE', 'UPDATE', 'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('admin-created account notifications start only after the transaction commits', () => {
  const source = readFileSync('src/services/AdminService.ts', 'utf8');
  const start = source.indexOf('async createUser(');
  const end = source.indexOf('async getPlaceableInterns(', start);
  const method = source.slice(start, end);
  const commit = method.indexOf("await client.query('COMMIT')");

  assert.notEqual(commit, -1);
  assert.ok(method.indexOf('this.sendAdminWelcomeEmail(', commit) > commit);
  assert.ok(method.indexOf('this.sendUserWelcomeEmail(', commit) > commit);
});

test('privileged manual identity creation fails closed for incomplete profile roles', async () => {
  await assert.rejects(
    () => new AdminService().createUser({
      name: 'Incomplete Profile',
      email: 'incomplete-profile@example.invalid',
      role: 'intern',
    }),
    /complete application profile/,
  );
  const routes = readFileSync('src/routes/adminRoutes.ts', 'utf8');
  assert.match(routes, /router\.post\('\/users', superAdminGuard, AdminController\.createUser\)/);
  assert.match(routes, /router\.post\('\/mentors', superAdminGuard,\s+AdminController\.createMentor\)/);
  assert.match(routes, /router\.patch\('\/mentors\/:id\/reset-password', superAdminGuard, AdminController\.resetMentorPassword\)/);
});

test('mentor credential handlers enforce bounded passwords without claiming delivery', () => {
  const controller = readFileSync('src/controllers/AdminController.ts', 'utf8');
  const service = readFileSync('src/services/AdminService.ts', 'utf8');
  assert.ok((controller.match(/password\.length > 128/g) ?? []).length >= 2);
  assert.equal(controller.includes('Credentials email sent'), false);
  assert.equal(service.includes('bcrypt.hash(data.password, 10)'), false);
  assert.equal(service.includes('bcrypt.hash(newPassword, 10)'), false);
});

function guardResult(guard, user) {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  guard({ user }, response, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
}

test('pending and forced-password-change accounts cannot use protected routes', () => {
  const internGuard = roleGuard('intern');
  const pending = guardResult(internGuard, {
    role: 'intern', status: 'pending', force_password_change: false,
  });
  assert.equal(pending.statusCode, 403);
  assert.equal(pending.nextCalled, false);

  const forced = guardResult(roleGuard('admin'), {
    role: 'admin', status: 'approved', force_password_change: true,
  });
  assert.equal(forced.statusCode, 403);
  assert.equal(forced.nextCalled, false);

  const approved = guardResult(internGuard, {
    role: 'intern', status: 'approved', force_password_change: false,
  });
  assert.equal(approved.nextCalled, true);
});

test('mentor namespace requires the existing mentor profile flag', () => {
  const ordinaryAdmin = guardResult(mentorGuard, {
    role: 'admin', status: 'approved', force_password_change: false, is_mentor: false,
  });
  assert.equal(ordinaryAdmin.statusCode, 403);

  const mentor = guardResult(mentorGuard, {
    role: 'admin', status: 'approved', force_password_change: false, is_mentor: true,
  });
  assert.equal(mentor.nextCalled, true);
});

test('mentor assignment authorization uses the mentor foreign key, not display names', () => {
  for (const file of [
    'src/services/AdminService.ts',
    'src/controllers/MentorController.ts',
    'src/services/CareerFileService.ts',
    'src/services/InternService.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('u.name = ip.mentor_name'), false, file);
    assert.equal(source.includes('ip.mentor_name ='), false, file);
  }
  const adminSource = readFileSync('src/services/AdminService.ts', 'utf8');
  assert.match(adminSource, /mentor_id=\$7/);
  assert.match(adminSource, /a\.is_mentor = TRUE/);
  assert.equal(adminSource.includes('values.push(payload.mentor)'), false);
  const internSource = readFileSync('src/services/InternService.ts', 'utf8');
  const trackStart = internSource.indexOf('async confirmTrack(');
  const trackEnd = internSource.indexOf('async submitDiscovery(', trackStart);
  const trackMethod = internSource.slice(trackStart, trackEnd);
  assert.equal(trackMethod.includes('SET track=$1, track_confirmed_at=NOW(), mentor_id='), false);
  assert.match(trackMethod, /AND mentor_id IS NOT NULL/);
});

test('placement creation uses the tracked accepted application status', () => {
  const source = readFileSync('src/services/AdminService.ts', 'utf8');
  assert.equal(
    source.includes("FROM applications WHERE id = $1 AND status = 'approved'"),
    false,
  );
  assert.equal(
    source.includes("WHERE a.id = $1 AND a.status = 'accepted'"),
    true,
  );
  const start = source.indexOf('async createPlacement(');
  const end = source.indexOf('// ─── Private helpers', start);
  const method = source.slice(start, end);
  assert.equal(method.includes('data.intern_id'), false);
  assert.equal(method.includes('data.company_id'), false);
  assert.equal(method.includes('data.slot_id'), false);
  assert.match(method, /ON CONFLICT \(application_id\) DO NOTHING/);
});

test('resource removal archives records instead of deleting them', () => {
  const source = readFileSync('src/services/AdminService.ts', 'utf8');
  const start = source.indexOf('async deleteResource(');
  const end = source.indexOf('// ─── Feedback', start);
  const method = source.slice(start, end);

  assert.match(method, /SET status='archived'/);
  assert.equal(method.includes('DELETE FROM resources'), false);
});

test('admin application results include the field used by the slot filter', () => {
  const source = readFileSync('src/services/ApplicationService.ts', 'utf8');
  const start = source.indexOf('async getAllApplications(');
  const method = source.slice(start);
  assert.match(method, /a\.slot_id/);
  assert.match(method, /r\.slot_id === filters\.slot_id/);
});
