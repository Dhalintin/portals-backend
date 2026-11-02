"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStaff = void 0;
const errors_1 = require("../lib/errors");
const requireStaff = (req, _res, next) => {
    if (!req.auth?.orgRole || ["PARENT", "STUDENT"].includes(req.auth.orgRole)) {
        return next(new errors_1.AppError(403, "FORBIDDEN", "School staff access required"));
    }
    next();
};
exports.requireStaff = requireStaff;
