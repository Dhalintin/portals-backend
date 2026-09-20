"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const validate_1 = require("../../common/middleware/validate");
const teacher_controller_1 = require("./teacher.controller");
const teacher_dto_1 = require("./teacher.dto");
const zod_1 = require("zod");
const classIdParams = zod_1.z.object({ classId: zod_1.z.string().uuid() });
const teacherRoutes = (0, express_1.Router)();
teacherRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
teacherRoutes.get("/", (0, authorize_1.authorize)("school_admin", "exam_officer"), (0, validate_1.validate)({ query: teacher_dto_1.listTeachersQuerySchema }), teacher_controller_1.teacherController.list);
teacherRoutes.post("/invite", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ body: teacher_dto_1.inviteTeacherBodySchema }), teacher_controller_1.teacherController.invite);
teacherRoutes.get("/me/assignments", (0, authorize_1.authorize)("school_admin", "teacher", "exam_officer"), teacher_controller_1.teacherController.myAssignments);
// Class staffing (used by class detail Teachers tab)
teacherRoutes.put("/classes/:classId/class-teacher", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({
    params: classIdParams,
    body: teacher_dto_1.setClassTeacherBodySchema,
}), teacher_controller_1.teacherController.setClassTeacher);
teacherRoutes.get("/classes/:classId/subject-teachers", (0, authorize_1.authorize)("school_admin", "exam_officer"), (0, validate_1.validate)({ params: classIdParams }), teacher_controller_1.teacherController.listClassSubjectTeachers);
teacherRoutes.put("/classes/:classId/subject-teachers", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({
    params: classIdParams,
    body: teacher_dto_1.setClassSubjectTeacherBodySchema,
}), teacher_controller_1.teacherController.setClassSubjectTeacher);
teacherRoutes.get("/:id", (0, authorize_1.authorize)("school_admin", "exam_officer"), (0, validate_1.validate)({ params: teacher_dto_1.teacherIdParamsSchema }), teacher_controller_1.teacherController.getById);
teacherRoutes.patch("/:id", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ params: teacher_dto_1.teacherIdParamsSchema, body: teacher_dto_1.updateTeacherBodySchema }), teacher_controller_1.teacherController.update);
teacherRoutes.delete("/:id", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ params: teacher_dto_1.teacherIdParamsSchema }), teacher_controller_1.teacherController.remove);
teacherRoutes.put("/:id/assignments", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ params: teacher_dto_1.teacherIdParamsSchema, body: teacher_dto_1.setAssignmentsBodySchema }), teacher_controller_1.teacherController.setAssignments);
exports.default = teacherRoutes;
