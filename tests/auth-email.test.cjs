const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = 'postgresql://test:test@localhost/schoolos_test';
process.env.JWT_ACCESS_SECRET = 'email-access-test-'.repeat(3); process.env.JWT_REFRESH_SECRET = 'email-refresh-test-'.repeat(3);
process.env.AUTH_EMAIL_KEY = Buffer.alloc(32, 9).toString('base64'); process.env.WEB_URL = 'https://portal.example.test';
process.env.EMAIL_PROVIDER = 'disabled';
const modulePath = require.resolve('../.test-build/lib/prisma');
require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: { prisma: {} } };
const { env } = require('../.test-build/config/env');
const original = { ...env };
const email = require('../.test-build/lib/authEmail');
const nodemailer = require('nodemailer');
afterEach(() => { mock.restoreAll(); Object.assign(env, original); });
const message = { id: 'test-job-id', recipient: 'recipient@example.test', subject: 'Invite', text: 'Test link' };

test('queued authentication links are encrypted and tampering is rejected', () => {
  const encrypted = email.encryptAuthEmail('secret-link-token');
  assert.ok(!encrypted.includes('secret-link-token')); assert.equal(email.decryptAuthEmail(encrypted), 'secret-link-token');
  const parts = encrypted.split('.'); parts[2] = Buffer.from('different body').toString('base64');
  assert.throws(() => email.decryptAuthEmail(parts.join('.')));
});
test('authentication links keep tokens in the fragment rather than URL query strings', () => {
  const link = new URL(email.authLink('/accept-invitation', 'secret-token'));
  assert.equal(link.search, ''); assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), 'secret-token');
  env.isProd = true; env.WEB_URL = 'http://portal.example.test';
  assert.throws(() => email.authLink('/reset-password', 'secret'), { code: 'EMAIL_NOT_CONFIGURED' });
});
test('SMTP uses verified TLS and closes its connection after sending', async () => {
  Object.assign(env, { EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'school@example.test', SMTP_HOST: 'smtp.example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'test' });
  let closed = false;
  mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.requireTLS, true); assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
    return { sendMail: async mail => { assert.equal(mail.to, message.recipient); assert.equal(mail.text, message.text); }, close: () => { closed = true; } };
  });
  await email.authEmailTransport.send(message); assert.equal(closed, true);
});
test('Resend requests have a bounded timeout and stable provider idempotency key', async () => {
  Object.assign(env, { EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'school@example.test', RESEND_API_KEY: 'test-api-key' });
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.headers['Idempotency-Key'], 'auth/test-job-id');
    assert.deepEqual(JSON.parse(options.body).to, [message.recipient]); assert.ok(options.signal);
    return { ok: true };
  });
  await email.authEmailTransport.send(message);
});
test('provider failures are reported without exposing response bodies or credentials', async () => {
  Object.assign(env, { EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'school@example.test', RESEND_API_KEY: 'secret-key' });
  mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  await assert.rejects(email.authEmailTransport.send(message), { message: 'EMAIL_PROVIDER_FAILURE' });
});
test('disabled email delivery never attempts a network request', async () => {
  mock.method(globalThis, 'fetch', async () => assert.fail('Network access must stay disabled'));
  assert.equal((await email.processAuthEmail()).status, 'disabled');
});
test('misconfigured delivery cannot consume queued jobs', async () => {
  env.EMAIL_PROVIDER = 'resend'; env.RESEND_API_KEY = undefined;
  await assert.rejects(email.processAuthEmail(), { code: 'EMAIL_NOT_CONFIGURED' });
});
test('new passwords reject bcrypt truncation aliases, including multibyte text', () => {
  const { passwordSchema } = require('../.test-build/features/auth/auth.validation');
  assert.equal(passwordSchema.safeParse('A1' + 'x'.repeat(70)).success, true);
  assert.equal(passwordSchema.safeParse('A1' + 'x'.repeat(71)).success, false);
  assert.equal(passwordSchema.safeParse('A1' + '界'.repeat(24)).success, false);
});
