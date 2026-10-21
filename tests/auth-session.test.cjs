const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/schoolos_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-'.repeat(3);
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-'.repeat(3);

const unexpected = async () => { throw new Error('Unexpected database query in session test'); };
const prisma = { $transaction: unexpected, $executeRaw: unexpected };
for (const model of ['user', 'membership', 'organization', 'authSession', 'passwordResetToken', 'auditLog']) {
  prisma[model] = Object.fromEntries(['findUnique', 'findFirst', 'create', 'update', 'updateMany']
    .map(method => [method, unexpected]));
}
const prismaPath = require.resolve('../.test-build/lib/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };
const { authSessions } = require('../.test-build/features/auth/auth.sessions');
const { authService } = require('../.test-build/features/auth/auth.service');
const { authenticate } = require('../.test-build/middlewares/authenticate');
const { verifyAccessToken, verifyRefreshToken, signRefreshToken } = require('../.test-build/auth/jwt');
const { sha256 } = require('../.test-build/lib/token');
const passwords = require('../.test-build/lib/password');
afterEach(() => mock.restoreAll());

// Stateful doubles model serialized transactions and rollback. They exercise
// lifecycle behavior, not PostgreSQL's actual advisory-lock implementation.
function setup() {
  const state = {
    user: { id: 'user-a', email: 'user@example.test', firstName: 'Jane', lastName: 'Doe',
      globalRole: 'USER', isActive: true, authVersion: 0, passwordHash: 'old-password-hash' },
    sessions: new Map(), resets: [], membershipActive: true,
    role: 'TEACHER', schoolActive: true,
  };
  let queue = Promise.resolve();
  mock.method(prisma, '$transaction', work => {
    const operation = queue.then(async () => {
      const before = structuredClone(state);
      try { return await work(prisma); }
      catch (error) { Object.assign(state, before); throw error; }
    });
    queue = operation.catch(() => {});
    return operation;
  });
  mock.method(prisma, '$executeRaw', async (_sql, userKey) => {
    assert.equal(userKey, 'auth:user-a'); return 1;
  });
  mock.method(prisma.user, 'findUnique', async ({ where }) =>
    where.id === state.user.id || where.email === state.user.email ? { ...state.user } : null);
  mock.method(prisma.user, 'update', async ({ data }) => {
    if (data.authVersion) state.user.authVersion += data.authVersion.increment;
    if (data.passwordHash) state.user.passwordHash = data.passwordHash;
    return { ...state.user };
  });
  mock.method(prisma.membership, 'findFirst', async ({ where }) => {
    if (!state.membershipActive || !state.schoolActive || where.userId !== state.user.id) return null;
    return { id: 'membership-a', userId: state.user.id, organizationId: where.organizationId,
      role: state.role, isActive: true, organization: { id: where.organizationId, name: 'Test school', slug: 'test-school' } };
  });
  mock.method(prisma.organization, 'findFirst', async () => state.schoolActive ? { id: 'school-a', name: 'Test school', slug: 'test-school' } : null);
  mock.method(prisma.authSession, 'create', async ({ data }) => {
    const row = { ...data, revokedAt: null, createdAt: new Date(), updatedAt: new Date() };
    state.sessions.set(row.id, row); return { ...row };
  });
  mock.method(prisma.authSession, 'findUnique', async ({ where }) => {
    const row = state.sessions.get(where.id); return row ? { ...row } : null;
  });
  mock.method(prisma.authSession, 'findFirst', async ({ where }) => {
    const row = [...state.sessions.values()].find(row => matches(row, where));
    return row ? { ...row } : null;
  });
  mock.method(prisma.authSession, 'update', async ({ where, data }) => {
    const row = state.sessions.get(where.id); Object.assign(row, data); return { ...row };
  });
  mock.method(prisma.authSession, 'updateMany', async ({ where, data }) => {
    let count = 0;
    for (const row of state.sessions.values()) if (matches(row, where)) { Object.assign(row, data); count++; }
    return { count };
  });
  mock.method(prisma.passwordResetToken, 'findFirst', async ({ where }) => {
    const row = state.resets.find(row => matches(row, where)); return row ? { ...row } : null;
  });
  mock.method(prisma.passwordResetToken, 'create', async ({ data }) => {
    const row = { id: randomUUID(), ...data, usedAt: null }; state.resets.push(row); return { ...row };
  });
  mock.method(prisma.passwordResetToken, 'updateMany', async ({ where, data }) => {
    if (where.user && !state.user.isActive) return { count: 0 };
    const { user, ...criteria } = where;
    let count = 0;
    for (const row of state.resets) if (matches(row, criteria)) { Object.assign(row, data); count++; }
    return { count };
  });
  mock.method(prisma.auditLog, 'create', async () => ({}));
  mock.method(passwords, 'hashPassword', async plain => `test-hash:${plain}`);
  return state;
}
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'gt' in value) return row[key] > value.gt;
    return row[key] === value;
  });
}
function access(token) {
  return new Promise((resolve, reject) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    Promise.resolve(authenticate(req, { locals: {} }, error => error ? reject(error) : resolve(req.auth))).catch(reject);
  });
}
function addReset(state, token) {
  state.resets.push({ id: randomUUID(), userId: state.user.id, tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60_000), usedAt: null });
}

test('session issuance stores only a refresh-token hash and binds access tokens to the session', async () => {
  const state = setup();
  const tokens = await authSessions.create('user-a', 'school-a', 0);
  const accessClaims = verifyAccessToken(tokens.accessToken);
  const refreshClaims = verifyRefreshToken(tokens.refreshToken);
  const session = state.sessions.get(accessClaims.sid);
  assert.equal(session.refreshTokenHash, sha256(tokens.refreshToken));
  assert.notEqual(session.refreshTokenHash, tokens.refreshToken);
  assert.equal(refreshClaims.sid, accessClaims.sid);
  assert.equal(session.schoolId, 'school-a');
  assert.equal(session.credentialVersion, 0);
  assert.equal((await access(tokens.accessToken)).sessionId, session.id);
});

test('refresh rotates the token with a new jti and preserves the absolute session expiry', async () => {
  const state = setup();
  const first = await authSessions.create('user-a', 'school-a', 0);
  const before = verifyRefreshToken(first.refreshToken);
  state.role = 'BURSAR';
  const second = await authSessions.refresh(first.refreshToken);
  const after = verifyRefreshToken(second.refreshToken);
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.notEqual(after.jti, before.jti);
  assert.equal(after.sid, before.sid); assert.equal(after.exp, before.exp);
  assert.equal(state.sessions.size, 1);
  assert.equal(state.sessions.get(after.sid).refreshTokenHash, sha256(second.refreshToken));
  assert.equal(second.orgRole, 'BURSAR');
  assert.equal(second.permissions.includes('payments:write'), true);
});

test('reuse of a rotated token commits session revocation before returning 401', async () => {
  const state = setup();
  const first = await authSessions.create('user-a', 'school-a', 0);
  const second = await authSessions.refresh(first.refreshToken);
  await assert.rejects(authSessions.refresh(first.refreshToken), { code: 'REFRESH_TOKEN_REUSED' });
  assert.ok(state.sessions.get(verifyRefreshToken(first.refreshToken).sid).revokedAt);
  await assert.rejects(access(second.accessToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authSessions.refresh(second.refreshToken), { code: 'SESSION_EXPIRED' });
});

test('simultaneous refreshes cannot create two valid successor sessions', async () => {
  const state = setup();
  const first = await authSessions.create('user-a', 'school-a', 0);
  const outcomes = await Promise.allSettled([
    authSessions.refresh(first.refreshToken), authSessions.refresh(first.refreshToken),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'REFRESH_TOKEN_REUSED');
  assert.ok(state.sessions.get(verifyRefreshToken(first.refreshToken).sid).revokedAt);
});

test('logout immediately rejects both access and refresh for the selected session', async () => {
  setup();
  const tokens = await authSessions.create('user-a', 'school-a', 0);
  const sid = verifyAccessToken(tokens.accessToken).sid;
  assert.deepEqual(await authService.logout('user-a', sid), { ok: true });
  await assert.rejects(access(tokens.accessToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authService.refresh(tokens.refreshToken), { code: 'SESSION_EXPIRED' });
  assert.deepEqual(await authService.logout('user-a', sid), { ok: true });
});

test('logout affects one session, while logout-all revokes the user across school workspaces', async () => {
  const state = setup();
  const first = await authSessions.create('user-a', 'school-a', 0);
  const second = await authSessions.create('user-a', 'school-b', 0);
  state.sessions.set('foreign-session', { id: 'foreign-session', userId: 'user-b', revokedAt: null });
  await authSessions.logout('user-a', verifyAccessToken(first.accessToken).sid);
  assert.equal((await access(second.accessToken)).schoolId, 'school-b');
  await authService.logoutAll('user-a');
  assert.equal(state.user.authVersion, 1);
  await assert.rejects(access(second.accessToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authSessions.refresh(second.refreshToken), { code: 'SESSION_EXPIRED' });
  assert.equal(state.sessions.get('foreign-session').revokedAt, null);
});

test('refresh rejects a token bound to a different school without revoking the valid session', async () => {
  const state = setup();
  const original = await authSessions.create('user-a', 'school-a', 0);
  const claims = verifyRefreshToken(original.refreshToken);
  const wrongSchool = signRefreshToken({ sub: claims.sub, sid: claims.sid, authVersion: claims.authVersion,
    jti: randomUUID(), schoolId: 'school-b' });
  await assert.rejects(authSessions.refresh(wrongSchool), { code: 'SESSION_EXPIRED' });
  assert.equal(state.sessions.get(claims.sid).revokedAt, null);
  await authSessions.refresh(original.refreshToken);
});

test('database session expiry rejects an otherwise unexpired signed JWT', async () => {
  const state = setup();
  const original = await authSessions.create('user-a', 'school-a', 0);
  state.sessions.get(verifyAccessToken(original.accessToken).sid).expiresAt = new Date(Date.now() - 1);
  await assert.rejects(access(original.accessToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authSessions.refresh(original.refreshToken), { code: 'SESSION_EXPIRED' });
});

test('unknown and legacy stateless tokens are rejected', async () => {
  setup();
  const unknown = signRefreshToken({ sub: 'user-a', sid: 'unknown', authVersion: 0, schoolId: 'school-a', jti: randomUUID() });
  await assert.rejects(authSessions.refresh(unknown), { code: 'SESSION_EXPIRED' });
  const legacy = jwt.sign({ sub: 'user-a', schoolId: 'school-a', typ: 'refresh' }, process.env.JWT_REFRESH_SECRET,
    { issuer: 'SchoolOS', expiresIn: '7d' });
  await assert.rejects(authSessions.refresh(legacy), { statusCode: 401 });
});

test('suspended users, schools and memberships cannot refresh sessions', async () => {
  const state = setup();
  const original = await authSessions.create('user-a', 'school-a', 0);
  state.schoolActive = false;
  await assert.rejects(authSessions.refresh(original.refreshToken), { statusCode: 401 });
  state.schoolActive = true; state.membershipActive = false;
  await assert.rejects(authSessions.refresh(original.refreshToken), { statusCode: 401 });
  state.membershipActive = true; state.user.isActive = false;
  await assert.rejects(authSessions.refresh(original.refreshToken), { statusCode: 401 });
});

test('platform sessions are persisted with no school and use current platform roles', async () => {
  const state = setup(); state.user.globalRole = 'SUPER_ADMIN';
  const tokens = await authSessions.create('user-a', null, 0);
  assert.equal(tokens.school, null);
  assert.equal(state.sessions.get(verifyAccessToken(tokens.accessToken).sid).schoolId, null);
  assert.equal((await access(tokens.accessToken)).globalRole, 'SUPER_ADMIN');
  state.user.globalRole = 'USER';
  await assert.rejects(authSessions.refresh(tokens.refreshToken), { statusCode: 401 });
});

test('credentials verified before logout-all or a reset cannot issue a new session afterwards', async () => {
  const state = setup(); state.user.authVersion = 1;
  await assert.rejects(authSessions.create('user-a', 'school-a', 0), { code: 'CREDENTIALS_CHANGED' });
  assert.equal(state.sessions.size, 0);
});

test('password reset consumes the link, invalidates other reset links and revokes all sessions atomically', async () => {
  const state = setup();
  const first = await authSessions.create('user-a', 'school-a', 0);
  const second = await authSessions.create('user-a', 'school-b', 0);
  addReset(state, 'reset-a'); addReset(state, 'reset-b');
  await authService.resetPassword('reset-a', 'NewPassword123');
  assert.equal(state.user.passwordHash, 'test-hash:NewPassword123');
  assert.equal(state.user.authVersion, 1);
  assert.ok(state.resets.every(row => row.usedAt));
  assert.ok([...state.sessions.values()].every(row => row.revokedAt));
  await assert.rejects(access(first.accessToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authSessions.refresh(second.refreshToken), { code: 'SESSION_EXPIRED' });
  await assert.rejects(authService.resetPassword('reset-b', 'AnotherPassword123'), { code: 'INVALID_TOKEN' });
});

test('simultaneous password resets consume at most one reset link', async () => {
  const state = setup(); addReset(state, 'reset-a'); addReset(state, 'reset-b');
  const outcomes = await Promise.allSettled([
    authService.resetPassword('reset-a', 'PasswordA123'), authService.resetPassword('reset-b', 'PasswordB123'),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'INVALID_TOKEN');
  assert.equal(state.user.authVersion, 1);
});

test('a failed reset transaction preserves the old password and leaves the reset link unused', async () => {
  const state = setup(); addReset(state, 'reset-a');
  mock.method(prisma.authSession, 'updateMany', async () => { throw new Error('Simulated write failure'); });
  await assert.rejects(authService.resetPassword('reset-a', 'NewPassword123'), /Simulated write failure/);
  assert.equal(state.user.passwordHash, 'old-password-hash');
  assert.equal(state.user.authVersion, 0); assert.equal(state.resets[0].usedAt, null);
});

test('password reset cannot change an inactive account', async () => {
  const state = setup(); addReset(state, 'reset-a'); state.user.isActive = false;
  await assert.rejects(authService.resetPassword('reset-a', 'NewPassword123'), { code: 'INVALID_TOKEN' });
  assert.equal(state.user.passwordHash, 'old-password-hash');
});

test('an invalid signature cannot revoke a valid session', async () => {
  const state = setup();
  const original = await authSessions.create('user-a', 'school-a', 0);
  const parts = original.refreshToken.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  await assert.rejects(authSessions.refresh(parts.join('.')), { code: 'UNAUTHORIZED' });
  assert.equal(state.sessions.get(verifyRefreshToken(original.refreshToken).sid).revokedAt, null);
  await authSessions.refresh(original.refreshToken);
});

test('an expired signed refresh token is rejected before changing session state', async () => {
  const state = setup();
  const original = await authSessions.create('user-a', 'school-a', 0);
  const claims = verifyRefreshToken(original.refreshToken);
  const expired = signRefreshToken({ sub: claims.sub, sid: claims.sid, schoolId: claims.schoolId,
    authVersion: 0, jti: randomUUID() }, new Date(Date.now() - 10_000));
  await assert.rejects(authSessions.refresh(expired), { code: 'UNAUTHORIZED' });
  assert.equal(state.sessions.get(claims.sid).revokedAt, null);
});

test('login rejects a password that was verified immediately before its credential version changed', async () => {
  const state = setup();
  mock.method(passwords, 'verifyPassword', async () => { state.user.authVersion++; return true; });
  await assert.rejects(authService.login({ email: state.user.email, password: 'OldPassword123', schoolSlug: 'test-school' }), { code: 'CREDENTIALS_CHANGED' });
  assert.equal(state.sessions.size, 0);
});

test('HTTP login, refresh, logout and logout-all use the persisted session lifecycle', async () => {
  const state = setup();
  mock.method(passwords, 'verifyPassword', async () => true);
  const app = express(); app.use(express.json());
  app.use('/auth', require('../.test-build/features/auth/auth.routes').default);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  async function post(path, body, accessToken) {
    return fetch(base + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }, body: JSON.stringify(body) });
  }
  async function login() {
    const response = await post('/login', { email: state.user.email, password: 'Password123', schoolSlug: 'test-school' });
    assert.equal(response.status, 200); return (await response.json()).data;
  }
  try {
    const initial = await login();
    const rotated = await post('/refresh', { refreshToken: initial.refreshToken });
    assert.equal(rotated.status, 200);
    const current = (await rotated.json()).data;
    assert.equal((await post('/logout', {}, current.accessToken)).status, 200);
    assert.equal((await fetch(base + '/me', { headers: { Authorization: `Bearer ${current.accessToken}` } })).status, 401);
    assert.equal((await post('/refresh', { refreshToken: current.refreshToken })).status, 401);
    const deviceA = await login(); const deviceB = await login();
    assert.equal((await post('/logout-all', {}, deviceA.accessToken)).status, 200);
    assert.equal((await post('/refresh', { refreshToken: deviceB.refreshToken })).status, 401);
    assert.equal(state.user.authVersion, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
