"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownProfile = ownProfile;
exports.updateOwnProfile = updateOwnProfile;
exports.changeOwnPassword = changeOwnPassword;
const prisma_1 = require("../../lib/prisma");
const userTransaction_1 = require("../../lib/userTransaction");
const password_1 = require("../../lib/password");
const errors_1 = require("../../lib/errors");
const profile_validation_1 = require("./profile.validation");
const profileSelect = { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, globalRole: true };
async function liveAccount(tx, auth) {
    const user = await tx.user.findUnique({ where: { id: auth.userId } });
    if (!user?.isActive || !await tx.authSession.findFirst({ where: { id: auth.sessionId, userId: user.id,
            credentialVersion: user.authVersion, revokedAt: null, expiresAt: { gt: new Date() } } })) {
        throw new errors_1.AppError(401, "SESSION_EXPIRED", "Sign in again to update your account.");
    }
    return user;
}
async function ownProfile(auth) {
    const user = await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { ...profileSelect, passwordHash: true } });
    const { passwordHash, ...profile } = user;
    return { user: profile, hasPassword: Boolean(passwordHash) };
}
async function updateOwnProfile(auth, raw) {
    const input = profile_validation_1.profileUpdateSchema.parse(raw);
    return (0, userTransaction_1.userTransaction)(auth.userId, async (tx) => {
        await liveAccount(tx, auth);
        const user = await tx.user.update({ where: { id: auth.userId }, data: input, select: profileSelect });
        await tx.auditLog.create({ data: { actorId: auth.userId, organizationId: auth.schoolId, action: "SETTINGS_CHANGED",
                entity: "User", entityId: auth.userId, metadata: { operation: "PROFILE_UPDATED", fields: Object.keys(input) } } });
        return { user };
    });
}
async function changeOwnPassword(auth, raw) {
    const input = profile_validation_1.passwordChangeSchema.parse(raw);
    const passwordHash = await (0, password_1.hashPassword)(input.newPassword);
    return (0, userTransaction_1.userTransaction)(auth.userId, async (tx) => {
        const user = await liveAccount(tx, auth);
        if (!user.passwordHash)
            throw new errors_1.AppError(400, "PASSWORD_NOT_SET", "Use the password-reset email to set your first password.");
        if (!await (0, password_1.verifyPassword)(input.currentPassword, user.passwordHash))
            throw new errors_1.AppError(403, "INCORRECT_PASSWORD", "Your current password is incorrect.");
        if (await (0, password_1.verifyPassword)(input.newPassword, user.passwordHash))
            throw new errors_1.AppError(400, "PASSWORD_UNCHANGED", "Choose a different password.");
        const now = new Date();
        await tx.user.update({ where: { id: user.id }, data: { passwordHash, authVersion: { increment: 1 } } });
        await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
        await tx.auditLog.create({ data: { actorId: user.id, organizationId: auth.schoolId, action: "SETTINGS_CHANGED",
                entity: "User", entityId: user.id, metadata: { operation: "PASSWORD_CHANGED" } } });
        return { ok: true };
    });
}
