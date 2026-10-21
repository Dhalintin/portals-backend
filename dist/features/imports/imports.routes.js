"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
exports.default = importsRoutes;
