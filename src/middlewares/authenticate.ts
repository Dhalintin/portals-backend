import type { RequestHandler } from "express";
import { verifyAccessToken } from "../auth/jwt";
import type { AuthContext } from "../auth/types";
import { AppError } from "../lib/errors";
import { permissionsForMembership, membershipRoles, primaryRole } from "../auth/rbac";
import { prisma } from "../lib/prisma";

async function resolveContext(token: string): Promise<AuthContext> {
  const claims = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, globalRole: true, isActive: true, authVersion: true },
  });

  if (!user?.isActive)
    throw new AppError(401, "UNAUTHORIZED", "Account is inactive");

  if (user.authVersion !== claims.authVersion) {
    throw new AppError(
      401,
      "SESSION_EXPIRED",
      "Credentials changed; sign in again"
    );
  }

  const session = await prisma.authSession.findFirst({
    where: {
      id: claims.sid,
      userId: user.id,
      schoolId: claims.schoolId,
      credentialVersion: user.authVersion,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!session)
    throw new AppError(
      401,
      "SESSION_EXPIRED",
      "Session is no longer valid; sign in again"
    );

  if (!claims.schoolId) {
    if (
      user.globalRole !== "SUPER_ADMIN" &&
      user.globalRole !== "PLATFORM_ADMIN"
    ) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Platform access is no longer available"
      );
    }
    return {
      userId: user.id,
      sessionId: session.id,
      globalRole: user.globalRole,
      schoolId: null,
      orgRole: null,
      permissions: [],
    };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      organizationId: claims.schoolId,
      isActive: true,
      organization: { isActive: true },
    },
    select: { role: true, roles: true },
  });

  if (!membership)
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "School access is no longer available"
    );
  return {
    userId: user.id,
    sessionId: session.id,
    globalRole: user.globalRole,
    schoolId: claims.schoolId,
    orgRole: primaryRole(membershipRoles(membership)),
    orgRoles: membershipRoles(membership),
    permissions: permissionsForMembership(membership),
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
  }

  try {
    req.auth = await resolveContext(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
};

/** Optional auth — attaches context when token present */
export const authenticateOptional: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    req.auth = await resolveContext(header.slice(7));
  } catch (error) {
    return next(error);
  }
  next();
};
