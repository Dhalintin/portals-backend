"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authSessions = exports.AuthSessions = void 0;
const crypto_1 = require("crypto");
const errors_1 = require("../../lib/errors");
const token_1 = require("../../lib/token");
const userTransaction_1 = require("../../lib/userTransaction");
const rbac_1 = require("../../auth/rbac");
const jwt_1 = require("../../auth/jwt");
async function loadContext(tx, userId, schoolId) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.isActive)
        throw new errors_1.AppError(401, "UNAUTHORIZED", "Account is inactive");
    if (!schoolId) {
        if (user.globalRole !== "SUPER_ADMIN" && user.globalRole !== "PLATFORM_ADMIN") {
            throw new errors_1.AppError(401, "UNAUTHORIZED", "Platform access is no longer available");
        }
        return { user, membership: null, school: null };
    }
    const membership = await tx.membership.findFirst({
        where: { userId, organizationId: schoolId, isActive: true, organization: { isActive: true } },
        include: { organization: { select: { id: true, name: true, slug: true } } },
    });
    if (!membership)
        throw new errors_1.AppError(401, "UNAUTHORIZED", "School access is no longer available");
    return { user, membership, school: membership.organization };
}
function issueTokens(user, membership, school, sessionId, expiresAt) {
    const schoolId = membership?.organizationId ?? null;
    const orgRole = membership?.role ?? null;
    const permissions = orgRole ? (0, rbac_1.permissionsForOrgRole)(orgRole) : [];
    const accessToken = (0, jwt_1.signAccessToken)({
        sub: user.id, sid: sessionId, authVersion: user.authVersion,
        globalRole: user.globalRole, schoolId, orgRole, permissions,
    });
    const refreshToken = (0, jwt_1.signRefreshToken)({
        sub: user.id, sid: sessionId, jti: (0, crypto_1.randomUUID)(), authVersion: user.authVersion, schoolId,
    }, expiresAt);
    return {
        accessToken, refreshToken, tokenType: "Bearer",
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl, globalRole: user.globalRole },
        school, orgRole, permissions,
    };
}
class AuthSessions {
    async create(userId, schoolId, expectedAuthVersion) {
        return (0, userTransaction_1.userTransaction)(userId, async (tx) => {
            const { user, membership, school } = await loadContext(tx, userId, schoolId);
            if (user.authVersion !== expectedAuthVersion) {
                throw new errors_1.AppError(401, "CREDENTIALS_CHANGED", "Credentials changed; sign in again");
            }
            const id = (0, crypto_1.randomUUID)();
            const tokens = issueTokens(user, membership, school, id);
            const expiresAt = new Date((0, jwt_1.verifyRefreshToken)(tokens.refreshToken).exp * 1000);
            await tx.authSession.create({ data: {
                    id, userId, schoolId, credentialVersion: user.authVersion,
                    refreshTokenHash: (0, token_1.sha256)(tokens.refreshToken), expiresAt,
                } });
            return tokens;
        });
    }
    async refresh(refreshToken) {
        const claims = (0, jwt_1.verifyRefreshToken)(refreshToken);
        const result = await (0, userTransaction_1.userTransaction)(claims.sub, async (tx) => {
            const now = new Date();
            const session = await tx.authSession.findUnique({ where: { id: claims.sid } });
            if (!session || session.userId !== claims.sub || session.schoolId !== claims.schoolId ||
                session.credentialVersion !== claims.authVersion || session.revokedAt || session.expiresAt <= now) {
                return { error: "SESSION_EXPIRED" };
            }
            const hash = (0, token_1.sha256)(refreshToken);
            const matches = /^[a-f0-9]{64}$/.test(session.refreshTokenHash) &&
                (0, crypto_1.timingSafeEqual)(Buffer.from(session.refreshTokenHash, "hex"), Buffer.from(hash, "hex"));
            if (!matches) {
                // Return the failure, rather than throwing inside the transaction:
                // revocation must commit before we reject a reused token.
                await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
                return { error: "REFRESH_TOKEN_REUSED" };
            }
            const { user, membership, school } = await loadContext(tx, claims.sub, session.schoolId);
            if (user.authVersion !== session.credentialVersion) {
                await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
                return { error: "SESSION_EXPIRED" };
            }
            const tokens = issueTokens(user, membership, school, session.id, session.expiresAt);
            const changed = await tx.authSession.updateMany({
                where: { id: session.id, refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: now } },
                data: { refreshTokenHash: (0, token_1.sha256)(tokens.refreshToken) },
            });
            if (changed.count !== 1) {
                await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
                return { error: "REFRESH_TOKEN_REUSED" };
            }
            return { tokens };
        });
        if (result.error) {
            throw new errors_1.AppError(401, result.error, "Session is no longer valid; sign in again");
        }
        return result.tokens;
    }
    async logout(userId, sessionId) {
        await (0, userTransaction_1.userTransaction)(userId, (tx) => tx.authSession.updateMany({
            where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() },
        }));
        return { ok: true };
    }
    async logoutAll(userId) {
        await (0, userTransaction_1.userTransaction)(userId, async (tx) => {
            await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
            await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
        });
        return { ok: true };
    }
}
exports.AuthSessions = AuthSessions;
exports.authSessions = new AuthSessions();
