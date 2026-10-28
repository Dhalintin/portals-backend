"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifiedGoogleProfile = verifiedGoogleProfile;
exports.googleLogin = googleLogin;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const goggle_1 = require("../../lib/goggle");
const auth_sessions_1 = require("./auth.sessions");
async function verifiedGoogleProfile(idToken, nonce) {
    if (!process.env.GOOGLE_CLIENT_ID)
        throw new errors_1.AppError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured. You can continue with a password.");
    try {
        const profile = await (0, goggle_1.verifyGoogleIdToken)(idToken, nonce);
        if (!profile.emailVerified)
            throw new Error("Unverified email");
        return profile;
    }
    catch {
        throw new errors_1.AppError(401, "GOOGLE_AUTH_FAILED", "Google sign-in could not be verified. Choose your account and try again.");
    }
}
// Google login never creates or links accounts. That happens only when accepting
// an invitation for the same verified email, with the existing invitation checks.
async function googleLogin(idToken, nonce, schoolSlug) {
    const profile = await verifiedGoogleProfile(idToken, nonce);
    const user = await prisma_1.prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (!user || !user.isActive || user.email !== profile.email)
        throw new errors_1.AppError(403, "GOOGLE_LINK_REQUIRED", "Open your school invitation and choose Google first, or sign in with your password.");
    if (user.globalRole === "SUPER_ADMIN" || user.globalRole === "PLATFORM_ADMIN")
        return auth_sessions_1.authSessions.create(user.id, null, user.authVersion);
    const memberships = await prisma_1.prisma.membership.findMany({
        where: { userId: user.id, isActive: true, organization: { isActive: true, ...(schoolSlug ? { slug: schoolSlug } : {}) } },
        include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true } } },
        orderBy: { organization: { name: "asc" } },
    });
    if (!memberships.length)
        throw new errors_1.AppError(403, "NO_ACTIVE_SCHOOL", "Your account has no active access to this school. Ask your school for help.");
    if (memberships.length > 1)
        throw new errors_1.AppError(409, "SCHOOL_SELECTION_REQUIRED", "Choose your school to continue.", { schools: memberships.map(member => ({ ...member.organization, role: member.role })) });
    return auth_sessions_1.authSessions.create(user.id, memberships[0].organizationId, user.authVersion);
}
