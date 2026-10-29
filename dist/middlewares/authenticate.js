"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateOptional = exports.authenticate = void 0;
const jwt_1 = require("../auth/jwt");
const errors_1 = require("../lib/errors");
const rbac_1 = require("../auth/rbac");
const prisma_1 = require("../lib/prisma");
async function resolveContext(token) {
    const claims = (0, jwt_1.verifyAccessToken)(token);
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, globalRole: true, isActive: true, authVersion: true },
    });
    if (!user?.isActive)
        throw new errors_1.AppError(401, "UNAUTHORIZED", "Account is inactive");
    if (user.authVersion !== claims.authVersion) {
        throw new errors_1.AppError(401, "SESSION_EXPIRED", "Credentials changed; sign in again");
    }
    const session = await prisma_1.prisma.authSession.findFirst({
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
        throw new errors_1.AppError(401, "SESSION_EXPIRED", "Session is no longer valid; sign in again");
    if (!claims.schoolId) {
        if (user.globalRole !== "SUPER_ADMIN" &&
            user.globalRole !== "PLATFORM_ADMIN") {
            throw new errors_1.AppError(401, "UNAUTHORIZED", "Platform access is no longer available");
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
    const membership = await prisma_1.prisma.membership.findFirst({
        where: {
            userId: user.id,
            organizationId: claims.schoolId,
            isActive: true,
            organization: { isActive: true },
        },
        select: { role: true, roles: true },
    });
    if (!membership)
        throw new errors_1.AppError(401, "UNAUTHORIZED", "School access is no longer available");
    return {
        userId: user.id,
        sessionId: session.id,
        globalRole: user.globalRole,
        schoolId: claims.schoolId,
        orgRole: (0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(membership)),
        orgRoles: (0, rbac_1.membershipRoles)(membership),
        permissions: (0, rbac_1.permissionsForMembership)(membership),
    };
}
const authenticate = async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return next(new errors_1.AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    try {
        req.auth = await resolveContext(header.slice(7));
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.authenticate = authenticate;
/** Optional auth — attaches context when token present */
const authenticateOptional = async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return next();
    try {
        req.auth = await resolveContext(header.slice(7));
    }
    catch (error) {
        return next(error);
    }
    next();
};
exports.authenticateOptional = authenticateOptional;
