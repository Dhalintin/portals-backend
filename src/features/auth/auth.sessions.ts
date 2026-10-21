import { randomUUID, timingSafeEqual } from "crypto";
import type { Membership, Prisma, User } from "@prisma/client";
import { AppError } from "../../lib/errors";
import { sha256 } from "../../lib/token";
import { userTransaction } from "../../lib/userTransaction";
import { permissionsForOrgRole } from "../../auth/rbac";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../auth/jwt";

type School = { id: string; name: string; slug: string };

async function loadContext(tx: Prisma.TransactionClient, userId: string, schoolId: string | null) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) throw new AppError(401, "UNAUTHORIZED", "Account is inactive");
  if (!schoolId) {
    if (user.globalRole !== "SUPER_ADMIN" && user.globalRole !== "PLATFORM_ADMIN") {
      throw new AppError(401, "UNAUTHORIZED", "Platform access is no longer available");
    }
    return { user, membership: null, school: null };
  }
  const membership = await tx.membership.findFirst({
    where: { userId, organizationId: schoolId, isActive: true, organization: { isActive: true } },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!membership) throw new AppError(401, "UNAUTHORIZED", "School access is no longer available");
  return { user, membership, school: membership.organization };
}

function issueTokens(user: User, membership: Membership | null, school: School | null, sessionId: string, expiresAt?: Date) {
  const schoolId = membership?.organizationId ?? null;
  const orgRole = membership?.role ?? null;
  const permissions = orgRole ? permissionsForOrgRole(orgRole) : [];
  const accessToken = signAccessToken({
    sub: user.id, sid: sessionId, authVersion: user.authVersion,
    globalRole: user.globalRole, schoolId, orgRole, permissions,
  });
  const refreshToken = signRefreshToken({
    sub: user.id, sid: sessionId, jti: randomUUID(), authVersion: user.authVersion, schoolId,
  }, expiresAt);
  return {
    accessToken, refreshToken, tokenType: "Bearer" as const,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, globalRole: user.globalRole },
    school, orgRole, permissions,
  };
}

export class AuthSessions {
  async create(userId: string, schoolId: string | null, expectedAuthVersion: number) {
    return userTransaction(userId, async (tx) => {
      const { user, membership, school } = await loadContext(tx, userId, schoolId);
      if (user.authVersion !== expectedAuthVersion) {
        throw new AppError(401, "CREDENTIALS_CHANGED", "Credentials changed; sign in again");
      }
      const id = randomUUID();
      const tokens = issueTokens(user, membership, school, id);
      const expiresAt = new Date(verifyRefreshToken(tokens.refreshToken).exp * 1000);
      await tx.authSession.create({ data: {
        id, userId, schoolId, credentialVersion: user.authVersion,
        refreshTokenHash: sha256(tokens.refreshToken), expiresAt,
      } });
      return tokens;
    });
  }

  async refresh(refreshToken: string) {
    const claims = verifyRefreshToken(refreshToken);
    const result = await userTransaction(claims.sub, async (tx) => {
      const now = new Date();
      const session = await tx.authSession.findUnique({ where: { id: claims.sid } });
      if (!session || session.userId !== claims.sub || session.schoolId !== claims.schoolId ||
          session.credentialVersion !== claims.authVersion || session.revokedAt || session.expiresAt <= now) {
        return { error: "SESSION_EXPIRED" as const };
      }

      const hash = sha256(refreshToken);
      const matches = /^[a-f0-9]{64}$/.test(session.refreshTokenHash) &&
        timingSafeEqual(Buffer.from(session.refreshTokenHash, "hex"), Buffer.from(hash, "hex"));
      if (!matches) {
        // Return the failure, rather than throwing inside the transaction:
        // revocation must commit before we reject a reused token.
        await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
        return { error: "REFRESH_TOKEN_REUSED" as const };
      }

      const { user, membership, school } = await loadContext(tx, claims.sub, session.schoolId);
      if (user.authVersion !== session.credentialVersion) {
        await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
        return { error: "SESSION_EXPIRED" as const };
      }
      const tokens = issueTokens(user, membership, school, session.id, session.expiresAt);
      const changed = await tx.authSession.updateMany({
        where: { id: session.id, refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: now } },
        data: { refreshTokenHash: sha256(tokens.refreshToken) },
      });
      if (changed.count !== 1) {
        await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
        return { error: "REFRESH_TOKEN_REUSED" as const };
      }
      return { tokens };
    });
    if (result.error) {
      throw new AppError(401, result.error, "Session is no longer valid; sign in again");
    }
    return result.tokens;
  }

  async logout(userId: string, sessionId: string) {
    await userTransaction(userId, (tx) => tx.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() },
    }));
    return { ok: true };
  }

  async logoutAll(userId: string) {
    await userTransaction(userId, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }
}

export const authSessions = new AuthSessions();
