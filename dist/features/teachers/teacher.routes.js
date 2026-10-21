"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_1 = require("../../middlewares/validate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requireStaff_1 = require("../../middlewares/requireStaff");
const teacher_controller_1 = require("./teacher.controller");
const teacher_dto_1 = require("./teacher.dto");
const zod_1 = require("zod");
const rateLimit_1 = require("../../middlewares/rateLimit");
const authenticate_1 = require("../../middlewares/authenticate");
const permissions_1 = require("../../auth/permissions");
const requirePermission_1 = require("../../middlewares/requirePermission");
const classIdParams = zod_1.z.object({ classId: zod_1.z.string().uuid() });
const validate = (schemas) => Object.entries(schemas).map(([source, schema]) => (0, validate_1.validate)(schema, source));
const teacherRoutes = (0, express_1.Router)();
teacherRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool, requireStaff_1.requireStaff);
teacherRoutes.get("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["staff:read"]), validate({ query: teacher_dto_1.listTeachersQuerySchema }), teacher_controller_1.teacherController.list);
teacherRoutes.post("/invite", (0, requirePermission_1.requirePermission)("staff:write"), rateLimit_1.invitationLimiter, validate({ body: teacher_dto_1.inviteTeacherBodySchema }), teacher_controller_1.teacherController.invite);
teacherRoutes.get("/me/assignments", (0, requirePermission_1.requirePermission)("classes:read"), teacher_controller_1.teacherController.myAssignments);
// Class staffing (used by class detail Teachers tab)
teacherRoutes.put("/classes/:classId/class-teacher", (0, requirePermission_1.requirePermission)("staff:write"), validate({
    params: classIdParams,
    body: teacher_dto_1.setClassTeacherBodySchema,
}), teacher_controller_1.teacherController.setClassTeacher);
teacherRoutes.get("/classes/:classId/subject-teachers", (0, requirePermission_1.requirePermission)("staff:read"), validate({ params: classIdParams }), teacher_controller_1.teacherController.listClassSubjectTeachers);
teacherRoutes.put("/classes/:classId/subject-teachers", (0, requirePermission_1.requirePermission)("staff:write"), validate({
    params: classIdParams,
    body: teacher_dto_1.setClassSubjectTeacherBodySchema,
}), teacher_controller_1.teacherController.setClassSubjectTeacher);
teacherRoutes.get("/:id", (0, requirePermission_1.requirePermission)("staff:read"), validate({ params: teacher_dto_1.teacherIdParamsSchema }), teacher_controller_1.teacherController.getById);
teacherRoutes.patch("/:id", (0, requirePermission_1.requirePermission)("staff:write"), validate({ params: teacher_dto_1.teacherIdParamsSchema, body: teacher_dto_1.updateTeacherBodySchema }), teacher_controller_1.teacherController.update);
teacherRoutes.delete("/:id", (0, requirePermission_1.requirePermission)("staff:write"), validate({ params: teacher_dto_1.teacherIdParamsSchema }), teacher_controller_1.teacherController.remove);
teacherRoutes.put("/:id/assignments", (0, requirePermission_1.requirePermission)("staff:write"), validate({ params: teacher_dto_1.teacherIdParamsSchema, body: teacher_dto_1.setAssignmentsBodySchema }), teacher_controller_1.teacherController.setAssignments);
exports.default = teacherRoutes;
