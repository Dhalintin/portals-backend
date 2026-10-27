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

 test('Brevo delivery uses the shared mailing service and propagates failure for retry', async () => {
  Object.assign(env, { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-key', EMAIL_FROM: 'school@example.test' });
  const mailing = require('../.test-build/utils/mailing');
  const send = mock.method(mailing, 'sendEmail', async mail => {
    assert.equal(mail.receiptent.email, message.recipient);
    assert.equal(mail.subject, message.subject);
    assert.equal(mail.text, message.text);
  });
  await email.authEmailTransport.send(message);
  assert.equal(send.mock.callCount(), 1);
  send.mock.mockImplementation(async () => { throw new Error('EMAIL_PROVIDER_FAILURE'); });
  await assert.rejects(email.authEmailTransport.send(message), { message: 'EMAIL_PROVIDER_FAILURE' });
});

 test('API background delivery starts the existing queue and stops without scheduling another cycle', async () => {
  Object.assign(env, { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-key', EMAIL_FROM: 'school@example.test' });
  const cycle = require('../.test-build/lib/emailWorkerCycle');
  let complete;
  const run = mock.method(cycle, 'emailWorkerCycle', () => new Promise(resolve => { complete = resolve; }));
  mock.method(console, 'info', () => {});
  const timers = mock.method(globalThis, 'setTimeout', () => { assert.fail('Stopped delivery must not schedule another cycle'); });
  const { startBackgroundEmail } = require('../.test-build/lib/backgroundEmail');
  const stop = startBackgroundEmail();
  assert.equal(run.mock.callCount(), 1);
  stop(); complete({ failures: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.mock.callCount(), 0);
});
 test('disabled or misconfigured background delivery does not claim queued emails', () => {
  const cycle = require('../.test-build/lib/emailWorkerCycle');
  const run = mock.method(cycle, 'emailWorkerCycle', async () => { assert.fail('Must not consume jobs'); });
  mock.method(console, 'info', () => {});
  const logged = mock.method(console, 'error', () => {});
  const { startBackgroundEmail } = require('../.test-build/lib/backgroundEmail');
  env.EMAIL_PROVIDER = 'disabled'; startBackgroundEmail()();
  env.EMAIL_PROVIDER = 'brevo'; env.BREVO_API_KEY = undefined; startBackgroundEmail()();
  assert.equal(run.mock.callCount(), 0); assert.equal(logged.mock.callCount(), 1);
});
