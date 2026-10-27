// A platform-wide merchant key must never silently collect money for the wrong school.
export function parentPaymentSubaccount(organizationId: string): string | null {
  if (!process.env.PAYSTACK_SECRET_KEY) return null;
  try {
    const code = JSON.parse(process.env.PAYSTACK_SCHOOL_SUBACCOUNTS || '{}')[organizationId];
    return typeof code === 'string' && /^ACCT_[a-zA-Z0-9]+$/.test(code) ? code : null;
  } catch { return null; }
}

