function releaseConfigIssues(env) {
  const issues = [];
  const configured = value => typeof value === 'string' && value.length > 0 && !/REPLACE|YOUR_|PROJECT_REF|POOLER_HOST/i.test(value);
  const httpsOrigin = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
    catch { return false; }
  };
  if (env.NODE_ENV !== 'production') issues.push('NODE_ENV must be production');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!configured(env[key]) || env[key].length < 32) issues.push(`${key} must be a configured secret of at least 32 characters`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) issues.push('Access and refresh secrets must differ');
  if (!httpsOrigin(env.WEB_URL)) issues.push('WEB_URL must be an exact HTTPS frontend origin');
  if (!env.CORS_ORIGINS || !env.CORS_ORIGINS.split(',').every(value => httpsOrigin(value.trim()))) issues.push('CORS_ORIGINS must list exact HTTPS frontend origins');
  try {
    const url = new URL(env.DATABASE_URL);
    if (!configured(env.DATABASE_URL) || !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))) throw new Error();
  } catch { issues.push('DATABASE_URL must be a configured PostgreSQL URL with TLS enabled'); }
  if (!configured(env.AUTH_EMAIL_KEY) || Buffer.from(env.AUTH_EMAIL_KEY, 'base64').length !== 32) issues.push('AUTH_EMAIL_KEY must encode 32 random bytes');
  const sender = env.EMAIL_FROM || (env.EMAIL_PROVIDER === 'brevo' ? env.SMTP_USER : undefined);
  if (!configured(sender) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) issues.push('EMAIL_FROM must be a configured sender email');
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!configured(env.RESEND_API_KEY)) issues.push('RESEND_API_KEY must be configured');
  } else if (env.EMAIL_PROVIDER === 'smtp') {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) if (!configured(env[key])) issues.push(`${key} must be configured`);
  } else if (env.EMAIL_PROVIDER === 'brevo') {
    if (!configured(env.BREVO_API_KEY)) issues.push('BREVO_API_KEY must be configured');
  } else issues.push('EMAIL_PROVIDER must enable brevo, resend or smtp');
  return issues;
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  const issues = releaseConfigIssues(process.env);
  for (const issue of issues) console.error(`[release] ${issue}`);
  if (issues.length) process.exitCode = 1;
  else console.log('[release] Configuration checks passed. Database connectivity, proxy trust, sender verification, delivery and restore still require staging checks.');
}
module.exports = { releaseConfigIssues };
