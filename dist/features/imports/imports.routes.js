"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const staffImport_1 = require("./staffImport");
const http_1 = require("../../lib/http");
const rateLimit_1 = require("../../middlewares/rateLimit");
// imports.routes.ts
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const permissions_1 = require("../../auth/permissions");
const imports_validation_1 = require("./imports.validation");
const imports_controller_1 = require("./imports.controller");
const c = new imports_controller_1.ImportsController();
const importsRoutes = (0, express_1.Router)();
importsRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
importsRoutes.post("/students", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(imports_validation_1.importStudentsSchema), c.students);
importsRoutes.post("/parents", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["parents:write"]), (0, validate_1.validate)(imports_validation_1.importParentsSchema), c.parents);
importsRoutes.post('/staff', (0, requirePermission_1.requirePermission)('staff:write'), rateLimit_1.invitationLimiter, async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, staffImport_1.importStaff)(req.auth.schoolId, req.auth.userId, req.body));
}
catch (error) {
    next(error);
} });
exports.default = importsRoutes;
