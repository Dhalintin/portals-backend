// src/lib/google.ts
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export type GoogleProfile = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export async function verifyGoogleIdToken(
  idToken: string,
  expectedNonce?: string
): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified || (expectedNonce && payload.nonce !== expectedNonce)) {
    throw new Error("Invalid Google token payload");
  }

  const words=payload.name?.trim().split(/\s+/)??[];
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    emailVerified: Boolean(payload.email_verified),
    firstName: payload.given_name?.trim() || words[0] || "User",
    lastName: payload.family_name?.trim() || words.slice(1).join(" "),
    avatarUrl: payload.picture ?? null,
  };
}
