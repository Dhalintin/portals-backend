const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertTestDatabaseUrl, testEnvironment } = require('../scripts/test-database.cjs');

test('database helpers require an explicit test URL and never fall back to DATABASE_URL', () => {
  assert.throws(() => assertTestDatabaseUrl(undefined), /TEST_DATABASE_URL/);
  assert.throws(() => assertTestDatabaseUrl('postgresql://user:pass@localhost:5432/production'), /loopback/);
  assert.throws(() => assertTestDatabaseUrl('postgresql://user:pass@remote.example.test:5432/schoolos_test'), /loopback/);
});
test('database helpers reject host redirection through URL parameters', () => {
  assert.throws(() => assertTestDatabaseUrl('postgresql://user@localhost:5432/schoolos_test?host=remote.example.test'), /loopback/);
});
test('test environment replaces configured database and token/provider secrets with test values', () => {
  const url = 'postgresql://schoolos_test@127.0.0.1:65432/schoolos_test';
  const env = testEnvironment(url);
  assert.equal(env.DATABASE_URL, url); assert.equal(env.DIRECT_URL, url);
  assert.equal(env.TEST_DATABASE_URL, url); assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PAYSTACK_SECRET_KEY, 'integration-paystack-secret');
  assert.equal(env.CORS_ORIGINS, 'https://schoolos.example.test');
  assert.match(env.DOTENV_CONFIG_PATH, /no-production-env\.test$/);
});

test('release config checks reject placeholders and unsafe origins without returning secret values', () => {
  const { releaseConfigIssues } = require('../scripts/release-config.cjs');
  const env = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
    DATABASE_URL: 'postgresql://test:secret@db.example.test:5432/postgres?sslmode=require',
    WEB_URL: 'https://school.example.test', CORS_ORIGINS: 'https://school.example.test',
    AUTH_EMAIL_KEY: Buffer.alloc(32, 8).toString('base64'), EMAIL_FROM: 'school@example.test', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'fake-test-key' };
  assert.deepEqual(releaseConfigIssues(env), []);
  const issues = releaseConfigIssues({ ...env, DATABASE_URL: 'postgresql://user:do-not-print@db.example.test/db',
    WEB_URL: 'http://school.example.test', CORS_ORIGINS: '*', RESEND_API_KEY: 'REPLACE_IN_RENDER' });
  assert.equal(issues.length, 4); assert.equal(JSON.stringify(issues).includes('do-not-print'), false);
  assert.ok(releaseConfigIssues({ ...env, JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET }).some(issue => issue.includes('differ')));
});

 test('release configuration accepts Brevo with the existing SMTP_USER sender', () => {
  const { releaseConfigIssues } = require('../scripts/release-config.cjs');
  const issues = releaseConfigIssues({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-brevo-key', SMTP_USER: 'sender@example.test' });
  assert.ok(!issues.some(issue => /EMAIL_PROVIDER|EMAIL_FROM|BREVO_API_KEY/.test(issue)));
  assert.ok(releaseConfigIssues({ EMAIL_PROVIDER: 'brevo', SMTP_USER: 'sender@example.test' }).includes('BREVO_API_KEY must be configured'));
});
