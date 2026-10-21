"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const imports_service_1 = require("./imports.service");
class ImportsController {
    students = async (req, res, next) => {
        try {
            const data = await imports_service_1.importsService.importStudents((0, requireSchool_1.getSchoolId)(req), req.body, req.auth.userId, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    parents = async (req, res, next) => {
        try {
            const data = await imports_service_1.importsService.importParents((0, requireSchool_1.getSchoolId)(req), req.body, req.auth.userId, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.ImportsController = ImportsController;
