"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const permissions_1 = require("../../auth/permissions");
const subjects_validation_1 = require("./subjects.validation");
const subjects_controller_1 = require("./subjects.controller");
const c = new subjects_controller_1.SubjectsController();
const subjectsRoutes = (0, express_1.Router)();
subjectsRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
subjectsRoutes.get("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:read"]), (0, validate_1.validate)(subjects_validation_1.listSubjectsQuerySchema, "query"), c.list);
subjectsRoutes.post("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(subjects_validation_1.createSubjectSchema), c.create);
subjectsRoutes.get("/:subjectId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:read"]), (0, validate_1.validate)(subjects_validation_1.subjectIdParamsSchema, "params"), c.get);
subjectsRoutes.patch("/:subjectId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(subjects_validation_1.subjectIdParamsSchema, "params"), (0, validate_1.validate)(subjects_validation_1.updateSubjectSchema), c.update);
subjectsRoutes.post("/:subjectId/archive", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["classes:write"]), (0, validate_1.validate)(subjects_validation_1.subjectIdParamsSchema, "params"), c.archive);
exports.default = subjectsRoutes;
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { subjectController } from "./subjects.controller";
// import {
//   createSubjectBodySchema,
//   listSubjectsQuerySchema,
//   subjectIdParamsSchema,
//   updateSubjectBodySchema,
// } from "./subject.dto";
// import { Role } from "../../common/types/auth";
// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];
// const subjectRoutes = Router();
// subjectRoutes.use(authenticate, requireSchoolContext);
// subjectRoutes.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listSubjectsQuerySchema }),
//   subjectController.list
// );
// subjectRoutes.post(
//   "/",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: createSubjectBodySchema }),
//   subjectController.create
// );
// subjectRoutes.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: subjectIdParamsSchema }),
//   subjectController.getById
// );
// subjectRoutes.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: subjectIdParamsSchema, body: updateSubjectBodySchema }),
//   subjectController.update
// );
// subjectRoutes.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: subjectIdParamsSchema }),
//   subjectController.remove
// );
// export default subjectRoutes;
