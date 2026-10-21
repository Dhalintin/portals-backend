"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
const errors_1 = require("../lib/errors");
const rbac_1 = require("../auth/rbac");
function requirePermission(...needed) {
    return (req, _res, next) => {
        if (!req.auth) {
            return next(new errors_1.AppError(401, "UNAUTHORIZED", "Authentication required"));
        }
        if (!(0, rbac_1.hasAllPermissions)(req.auth.permissions, needed)) {
            return next(new errors_1.AppError(403, "FORBIDDEN", "You do not have permission for this action"));
        }
        next();
    };
}
