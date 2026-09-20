"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/features/students/student.routes.ts
const express_1 = require("express");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const validate_1 = require("../../common/middleware/validate");
const student_controller_1 = require("./student.controller");
const student_dto_1 = require("./student.dto");
const studentRoutes = (0, express_1.Router)();
const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"];
studentRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
studentRoutes.get("/", (0, authorize_1.authorize)(...platformUsers), (0, validate_1.validate)({ query: student_dto_1.listStudentsQuerySchema }), student_controller_1.studentController.list);
studentRoutes.post("/", (0, authorize_1.authorize)("SCHOOL_ADMIN", "EXAM_OFFICER"), (0, validate_1.validate)({ body: student_dto_1.createStudentBodySchema }), student_controller_1.studentController.create);
studentRoutes.post("/bulk", (0, authorize_1.authorize)("SCHOOL_ADMIN", "EXAM_OFFICER"), (0, validate_1.validate)({ body: student_dto_1.bulkCreateStudentsBodySchema }), student_controller_1.studentController.bulkCreate);
studentRoutes.get("/:id", (0, authorize_1.authorize)(...platformUsers), (0, validate_1.validate)({ params: student_dto_1.studentIdParamsSchema }), student_controller_1.studentController.getById);
studentRoutes.patch("/:id", (0, authorize_1.authorize)("SCHOOL_ADMIN", "EXAM_OFFICER"), (0, validate_1.validate)({ params: student_dto_1.studentIdParamsSchema, body: student_dto_1.updateStudentBodySchema }), student_controller_1.studentController.update);
studentRoutes.delete("/:id", (0, authorize_1.authorize)("SCHOOL_ADMIN"), (0, validate_1.validate)({ params: student_dto_1.studentIdParamsSchema }), student_controller_1.studentController.remove);
exports.default = studentRoutes;
