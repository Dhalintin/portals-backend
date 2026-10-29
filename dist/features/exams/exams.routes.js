"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exams_validation_1 = require("./exams.validation");
const express_1 = require("express");
const zod_1 = require("zod");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requireStaff_1 = require("../../middlewares/requireStaff");
const requirePermission_1 = require("../../middlewares/requirePermission");
const http_1 = require("../../lib/http");
const exams_service_1 = require("./exams.service");
const routes = (0, express_1.Router)();
routes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
routes.get('/published', (0, requirePermission_1.requirePermission)('exams:read'), async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, exams_service_1.getPublishedExams)(req.auth, req.query));
}
catch (error) {
    next(error);
} });
routes.use(requireStaff_1.requireStaff);
routes.get('/editor', (0, requirePermission_1.requirePermission)('exams:write'), async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, exams_service_1.getExamEditor)(req.auth.schoolId, zod_1.z.string().uuid().parse(req.query.termId), exams_validation_1.assessmentKindSchema.parse(req.query.kind)));
}
catch (error) {
    next(error);
} });
routes.put('/timetable', (0, requirePermission_1.requirePermission)('exams:write'), async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, exams_service_1.saveExamTimetable)(req.auth.schoolId, req.auth.userId, req.body));
}
catch (error) {
    next(error);
} });
for (const [path, withdraw] of [['publish', false], ['unpublish', true]])
    routes.post('/timetable/' + path, (0, requirePermission_1.requirePermission)('exams:publish'), async (req, res, next) => { try {
        (0, http_1.sendSuccess)(res, await (0, exams_service_1.publishExamTimetable)(req.auth.schoolId, req.auth.userId, req.body, withdraw));
    }
    catch (error) {
        next(error);
    } });
exports.default = routes;
