"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePlatformStaff = exports.requireSuperAdmin = void 0;
exports.authorizeGlobal = authorizeGlobal;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../common/errors/AppError");
/**
 * Require JWT global role to be one of the allowed GlobalRole values.
 * Use for /platform/* routes (not school OrgRole / subdomain context).
 *
 * @example
 * router.get("/overview", authenticate, authorizeGlobal([GlobalRole.SUPER_ADMIN, GlobalRole.PLATFORM_ADMIN]), handler)
 * router.post("/admins", authenticate, authorizeGlobal([GlobalRole.SUPER_ADMIN]), handler)
 */
function authorizeGlobal(allowed) {
    const allowedSet = new Set(allowed.map(String));
    return (req, _res, next) => {
        try {
            const user = req.user;
            if (!user?.sub) {
                throw new AppError_1.UnauthorizedError("Authentication required");
            }
            const globalRole = (user.globalRole ?? user.role);
            if (!globalRole) {
                throw new AppError_1.ForbiddenError("Missing global role on token");
            }
            if (!allowedSet.has(globalRole)) {
                throw new AppError_1.ForbiddenError("Insufficient platform permissions");
            }
            // Optional: attach normalized role for handlers
            req.globalRole = globalRole;
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
/** Convenience: SUPER_ADMIN only */
exports.requireSuperAdmin = authorizeGlobal([client_1.GlobalRole.SUPER_ADMIN]);
/** Convenience: SUPER_ADMIN or PLATFORM_ADMIN */
exports.requirePlatformStaff = authorizeGlobal([
    client_1.GlobalRole.SUPER_ADMIN,
    client_1.GlobalRole.PLATFORM_ADMIN,
]);
