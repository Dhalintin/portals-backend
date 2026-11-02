"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGoogleIdToken = verifyGoogleIdToken;
// src/lib/google.ts
const google_auth_library_1 = require("google-auth-library");
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
async function verifyGoogleIdToken(idToken, expectedNonce) {
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
    const words = payload.name?.trim().split(/\s+/) ?? [];
    return {
        googleId: payload.sub,
        email: payload.email.toLowerCase().trim(),
        emailVerified: Boolean(payload.email_verified),
        firstName: payload.given_name?.trim() || words[0] || "User",
        lastName: payload.family_name?.trim() || words.slice(1).join(" "),
        avatarUrl: payload.picture ?? null,
    };
}
