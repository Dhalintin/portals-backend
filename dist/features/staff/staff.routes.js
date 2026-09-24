"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const staff_controller_1 = require("./staff.controller");
const staff_dto_1 = require("./staff.dto");
const client_1 = require("@prisma/client");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const validate_1 = require("../../common/middleware/validate");
const staffRoutes = (0, express_1.Router)();
const staffRoles = [
    client_1.OrgRole.TEACHER,
    client_1.OrgRole.EXAM_OFFICER,
    client_1.OrgRole.SCHOOL_ADMIN,
];
staffRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
/** GET /staff/me — dashboard: assignments + form classes */
staffRoutes.get("/me", (0, authorize_1.authorize)(...staffRoles), staff_controller_1.staffController.dashboard);
/** GET /staff/assignments — class+subject I teach */
staffRoutes.get("/assignments", (0, authorize_1.authorize)(...staffRoles), staff_controller_1.staffController.assignments);
/** GET /staff/classes/:classId — class detail if form teacher or I teach there */
staffRoutes.get("/classes/:classId", (0, authorize_1.authorize)(...staffRoles), (0, validate_1.validate)({ params: staff_dto_1.classIdParamSchema }), staff_controller_1.staffController.classDetail);
/** GET /staff/classes/:classId/students */
staffRoutes.get("/classes/:classId/students", (0, authorize_1.authorize)(...staffRoles), (0, validate_1.validate)({ params: staff_dto_1.classIdParamSchema }), staff_controller_1.staffController.classRoster);
/** GET /staff/entry-sheet?termId&classId&subjectId */
staffRoutes.get("/entry-sheet", (0, authorize_1.authorize)(...staffRoles), (0, validate_1.validate)({ query: staff_dto_1.entrySheetQuerySchema }), staff_controller_1.staffController.entrySheet);
/** PUT /staff/scores — bulk upsert (subject teacher ACL) */
staffRoutes.put("/scores", (0, authorize_1.authorize)(...staffRoles), (0, validate_1.validate)({ body: staff_dto_1.bulkScoresBodySchema }), staff_controller_1.staffController.bulkScores);
/** GET /staff/progress?termId&classId&subjectId */
staffRoutes.get("/progress", (0, authorize_1.authorize)(...staffRoles), (0, validate_1.validate)({ query: staff_dto_1.entrySheetQuerySchema }), staff_controller_1.staffController.progress);
exports.default = staffRoutes;
