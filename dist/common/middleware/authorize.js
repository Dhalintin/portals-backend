"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSchoolContext = void 0;
exports.authorize = authorize;
const AppError_1 = require("../errors/AppError");
function authorize(...roles) {
    return (req, _res, next) => {
        const role = req.auth ? req.auth.orgRole ?? req.auth.globalRole : req.user?.role;
        if (!role) {
            return next(new AppError_1.UnauthorizedError());
        }
        const allowed = roles;
        if (allowed.length && !allowed.includes(role)) {
            return next(new AppError_1.ForbiddenError("Insufficient permissions"));
        }
        next();
    };
}
/** School staff must be bound to a tenant */
const requireSchoolContext = (req, _res, next) => {
    if (req.auth) {
        if (!req.auth.schoolId)
            return next(new AppError_1.ForbiddenError("No school context on session"));
        return next();
    }
    if (!req.user) {
        return next(new AppError_1.UnauthorizedError());
    }
    if (req.user.role === "PLATFORM_ADMIN") {
        return next();
    }
    if (!req.user.schoolId) {
        return next(new AppError_1.ForbiddenError("No school context on token"));
    }
    next();
};
exports.requireSchoolContext = requireSchoolContext;
