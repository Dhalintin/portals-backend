"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const permissions_1 = require("../../auth/permissions");
const students_validation_1 = require("./students.validation");
const students_controller_1 = require("./students.controller");
const c = new students_controller_1.StudentsController();
const studentRoutes = (0, express_1.Router)();
studentRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
studentRoutes.get("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:read"]), (0, validate_1.validate)(students_validation_1.listStudentsQuerySchema, "query"), c.list);
studentRoutes.get("/export", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:read"]), c.exportRows);
studentRoutes.post("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(students_validation_1.createStudentSchema), c.create);
studentRoutes.post("/bulk", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(students_validation_1.bulkCreateStudentsSchema), c.bulkCreate);
studentRoutes.get("/:studentId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:read"]), (0, validate_1.validate)(students_validation_1.studentIdParamsSchema, "params"), c.get);
studentRoutes.patch("/:studentId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(students_validation_1.studentIdParamsSchema, "params"), (0, validate_1.validate)(students_validation_1.updateStudentSchema), c.update);
studentRoutes.post("/:studentId/archive", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(students_validation_1.studentIdParamsSchema, "params"), c.archive);
studentRoutes.post("/:studentId/enroll", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["students:write"]), (0, validate_1.validate)(students_validation_1.studentIdParamsSchema, "params"), (0, validate_1.validate)(students_validation_1.enrollStudentSchema), c.enroll);
exports.default = studentRoutes;
// // src/features/students/student.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { studentController } from "./student.controller";
// import {
//   bulkCreateStudentsBodySchema,
//   createStudentBodySchema,
//   listStudentsQuerySchema,
//   studentIdParamsSchema,
//   updateStudentBodySchema,
// } from "./student.dto";
// import { Role } from "../../common/types/auth";
// const studentRoutes = Router();
// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];
// studentRoutes.use(authenticate, requireSchoolContext);
// studentRoutes.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listStudentsQuerySchema }),
//   studentController.list
// );
// studentRoutes.post(
//   "/",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: createStudentBodySchema }),
//   studentController.create
// );
// studentRoutes.post(
//   "/bulk",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: bulkCreateStudentsBodySchema }),
//   studentController.bulkCreate
// );
// studentRoutes.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: studentIdParamsSchema }),
//   studentController.getById
// );
// studentRoutes.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: studentIdParamsSchema, body: updateStudentBodySchema }),
//   studentController.update
// );
// studentRoutes.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: studentIdParamsSchema }),
//   studentController.remove
// );
// export default studentRoutes;
