import type { Prisma } from "@prisma/client";
import type { AuthContext } from "../../auth/types";
import { prisma } from "../../lib/prisma";
import { userTransaction } from "../../lib/userTransaction";
import { hashPassword, verifyPassword } from "../../lib/password";
import { AppError } from "../../lib/errors";
import { passwordChangeSchema, profileUpdateSchema } from "./profile.validation";

const profileSelect = { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, globalRole: true } as const;
async function liveAccount(tx: Prisma.TransactionClient, auth: AuthContext) {
  const user = await tx.user.findUnique({ where: { id: auth.userId } });
  if (!user?.isActive || !await tx.authSession.findFirst({ where: { id: auth.sessionId, userId: user.id,
    credentialVersion: user.authVersion, revokedAt: null, expiresAt: { gt: new Date() } } })) {
    throw new AppError(401, "SESSION_EXPIRED", "Sign in again to update your account.");
  }
  return user;
}

export async function ownProfile(auth: AuthContext) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { ...profileSelect, passwordHash: true } });
  const { passwordHash, ...profile } = user;
  return { user: profile, hasPassword: Boolean(passwordHash) };
}

export async function updateOwnProfile(auth: AuthContext, raw: unknown) {
  const input = profileUpdateSchema.parse(raw);
  return userTransaction(auth.userId, async tx => {
    await liveAccount(tx, auth);
    const user = await tx.user.update({ where: { id: auth.userId }, data: input, select: profileSelect });
    await tx.auditLog.create({ data: { actorId: auth.userId, organizationId: auth.schoolId, action: "SETTINGS_CHANGED",
      entity: "User", entityId: auth.userId, metadata: { operation: "PROFILE_UPDATED", fields: Object.keys(input) } } });
    return { user };
  });
}

export async function changeOwnPassword(auth: AuthContext, raw: unknown) {
  const input = passwordChangeSchema.parse(raw);
  const passwordHash = await hashPassword(input.newPassword);
  return userTransaction(auth.userId, async tx => {
    const user = await liveAccount(tx, auth);
    if (!user.passwordHash) throw new AppError(400, "PASSWORD_NOT_SET", "Use the password-reset email to set your first password.");
    if (!await verifyPassword(input.currentPassword, user.passwordHash)) throw new AppError(403, "INCORRECT_PASSWORD", "Your current password is incorrect.");
    if (await verifyPassword(input.newPassword, user.passwordHash)) throw new AppError(400, "PASSWORD_UNCHANGED", "Choose a different password.");
    const now = new Date();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, authVersion: { increment: 1 } } });
    await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.auditLog.create({ data: { actorId: user.id, organizationId: auth.schoolId, action: "SETTINGS_CHANGED",
      entity: "User", entityId: user.id, metadata: { operation: "PASSWORD_CHANGED" } } });
    return { ok: true };
  });
}
