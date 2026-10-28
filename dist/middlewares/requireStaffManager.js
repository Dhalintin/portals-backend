"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStaffManager = void 0;
exports.isStaffManager = isStaffManager;
const errors_1 = require("../lib/errors");
function isStaffManager(role) {
    return ["PROPRIETOR", "PRINCIPAL", "SCHOOL_ADMIN"].includes(role ?? "");
}
const requireStaffManager = (req, _res, next) => {
    if (!isStaffManager(req.auth?.orgRole))
        return next(new errors_1.AppError(403, "FORBIDDEN", "Staff management is available to school owners, principals and school administrators only."));
    next();
};
exports.requireStaffManager = requireStaffManager;
