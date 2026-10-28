import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { verifyGoogleIdToken } from "../../lib/goggle";
import { authSessions } from "./auth.sessions";

export async function verifiedGoogleProfile(idToken: string, nonce: string) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured. You can continue with a password.");
  try {
    const profile = await verifyGoogleIdToken(idToken, nonce);
    if (!profile.emailVerified) throw new Error("Unverified email");
    return profile;
  } catch {
    throw new AppError(401, "GOOGLE_AUTH_FAILED", "Google sign-in could not be verified. Choose your account and try again.");
  }
}

// Google login never creates or links accounts. That happens only when accepting
// an invitation for the same verified email, with the existing invitation checks.
export async function googleLogin(idToken: string, nonce: string, schoolSlug?: string) {
  const profile = await verifiedGoogleProfile(idToken, nonce);
  const user = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (!user || !user.isActive || user.email !== profile.email) throw new AppError(403, "GOOGLE_LINK_REQUIRED", "Open your school invitation and choose Google first, or sign in with your password.");
  if (user.globalRole === "SUPER_ADMIN" || user.globalRole === "PLATFORM_ADMIN") return authSessions.create(user.id, null, user.authVersion);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, isActive: true, organization: { isActive: true, ...(schoolSlug ? { slug: schoolSlug } : {}) } },
    include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  if (!memberships.length) throw new AppError(403, "NO_ACTIVE_SCHOOL", "Your account has no active access to this school. Ask your school for help.");
  if (memberships.length > 1) throw new AppError(409, "SCHOOL_SELECTION_REQUIRED", "Choose your school to continue.", { schools: memberships.map(member => ({ ...member.organization, role: member.role })) });
  return authSessions.create(user.id, memberships[0].organizationId, user.authVersion);
}
