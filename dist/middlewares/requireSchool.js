"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSchool = void 0;
exports.getSchoolId = getSchoolId;
const errors_1 = require("../lib/errors");
const requireSchool = (req, _res, next) => {
    if (!req.auth) {
        return next(new errors_1.AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    if (!req.auth.schoolId) {
        return next(new errors_1.AppError(403, "SCHOOL_CONTEXT_REQUIRED", "This action requires a school workspace login"));
    }
    next();
};
exports.requireSchool = requireSchool;
/** Use inside services after requireSchool */
function getSchoolId(req) {
    const id = req.auth?.schoolId;
    if (!id) {
        throw new errors_1.AppError(403, "SCHOOL_CONTEXT_REQUIRED", "School context missing");
    }
    return id;
}
