const path = require('node:path');

function assertTestDatabaseUrl(value) {
  if (!value) throw new Error('Set TEST_DATABASE_URL to a dedicated local schoolos_test database. DATABASE_URL is never used as a fallback.');
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^schoolos_test(?:_[a-z0-9_]+)?$/i.test(database) || url.searchParams.has('host')) {
    throw new Error('Tests/seeds require a loopback PostgreSQL URL and a database named schoolos_test or schoolos_test_<suffix>.');
  }
  return value;
}

function testEnvironment(databaseUrl) {
  assertTestDatabaseUrl(databaseUrl);
  return {
    ...process.env,
    NODE_ENV: 'test', APP_NAME: 'SchoolOS',
    TRUST_PROXY: 'false',
    DB_POOL_MAX: '5',
    DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'integration-access-secret-'.repeat(3),
    JWT_REFRESH_SECRET: 'integration-refresh-secret-'.repeat(3),
    JWT_ACCESS_EXPIRES: '15m', JWT_REFRESH_EXPIRES: '7d', BCRYPT_ROUNDS: '10',
    PAYSTACK_SECRET_KEY: 'integration-paystack-secret',
    EMAIL_PROVIDER: 'disabled', WEB_URL: 'https://schoolos.example.test',
    CORS_ORIGINS: 'https://schoolos.example.test',
    AUTH_EMAIL_KEY: Buffer.alloc(32, 7).toString('base64'),
    EMAIL_FROM: 'no-reply@example.test', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false',
    SMTP_USER: 'test-user', SMTP_PASSWORD: 'test-password', RESEND_API_KEY: 'test-key-never-send',
    DOTENV_CONFIG_PATH: path.join(__dirname, 'no-production-env.test'),
  };
}

module.exports = { assertTestDatabaseUrl, testEnvironment };
