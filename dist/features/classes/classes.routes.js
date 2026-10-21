"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const permissions_1 = require("../../auth/permissions");
const classes_validation_1 = require("./classes.validation");
const classes_controller_1 = require("./classes.controller");
const c = new classes_controller_1.ClassesController();
const classRoutes = (0, express_1.Router)();
classRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
classRoutes.get("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:read"]), (0, validate_1.validate)(classes_validation_1.listClassesQuerySchema, "query"), c.list);
classRoutes.post("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.createClassSchema), c.create);
classRoutes.get("/:classId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:read"]), (0, validate_1.validate)(classes_validation_1.classIdParamsSchema, "params"), c.get);
classRoutes.patch("/:classId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classIdParamsSchema, "params"), (0, validate_1.validate)(classes_validation_1.updateClassSchema), c.update);
classRoutes.put("/:classId/class-teacher", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classIdParamsSchema, "params"), (0, validate_1.validate)(classes_validation_1.assignClassTeacherSchema), c.assignClassTeacher);
classRoutes.get("/:classId/subjects", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:read"]), (0, validate_1.validate)(classes_validation_1.classIdParamsSchema, "params"), c.listSubjects);
classRoutes.post("/:classId/subjects", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classIdParamsSchema, "params"), (0, validate_1.validate)(classes_validation_1.addClassSubjectSchema), c.addSubject);
classRoutes.delete("/:classId/subjects/:subjectId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classSubjectParamsSchema, "params"), c.removeSubject);
classRoutes.put("/:classId/subjects/:subjectId/teacher", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classSubjectParamsSchema, "params"), (0, validate_1.validate)(classes_validation_1.assignSubjectTeacherSchema), c.assignSubjectTeacher);
classRoutes.delete("/:classId/subjects/:subjectId/teacher", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(classes_validation_1.classSubjectParamsSchema, "params"), c.removeSubjectTeacher);
exports.default = classRoutes;
// // src/features/classes/class.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { classController } from "./classes.controller";
// import {
//   classIdParamsSchema,
//   createClassBodySchema,
//   listClassesQuerySchema,
//   updateClassBodySchema,
// } from "./classes.dto";
// import { classSubjectController } from "./classSubject.controller";
// import {
//   addClassSubjectBodySchema,
//   classIdForClassSubjectParamsSchema,
//   classSubjectParamsSchema,
//   setClassSubjectsBodySchema,
// } from "./classSubject.dto";
// import { Role } from "../../common/types/auth";
// const router = Router();
// router.use(authenticate, requireSchoolContext);
// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];
// router.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listClassesQuerySchema }),
//   classController.list
// );
// router.post(
//   "/",
//   authorize("SCHOOL_ADMIN"),
//   validate({ body: createClassBodySchema }),
//   classController.create
// );
// router.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: classIdParamsSchema }),
//   classController.getById
// );
// router.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: classIdParamsSchema, body: updateClassBodySchema }),
//   classController.update
// );
// router.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: classIdParamsSchema }),
//   classController.remove
// );
// // Class subject routes
// // In class.routes.ts (or separate router merged under /classes)
// router.get(
//   "/:classId/subjects",
//   authorize(...platformUsers),
//   validate({ params: classIdForClassSubjectParamsSchema }),
//   classSubjectController.list
// );
// router.put(
//   "/:classId/subjects",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({
//     params: classIdForClassSubjectParamsSchema,
//     body: setClassSubjectsBodySchema,
//   }),
//   classSubjectController.set
// );
// router.post(
//   "/:classId/subjects",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({
//     params: classIdForClassSubjectParamsSchema,
//     body: addClassSubjectBodySchema,
//   }),
//   classSubjectController.add
// );
// router.delete(
//   "/:classId/subjects/:subjectId",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: classIdForClassSubjectParamsSchema }),
//   classSubjectController.remove
// );
// export default router;
