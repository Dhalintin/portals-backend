"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const results_controller_1 = require("./results.controller");
const requireStaff_1 = require("../../middlewares/requireStaff");
const resultRoutes = (0, express_1.Router)();
resultRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
resultRoutes.get("/parent/me", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.parentResults);
resultRoutes.get("/parent/report-cards/:id", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.parentReportCard);
resultRoutes.use(requireStaff_1.requireStaff);
resultRoutes.get("/entry-sheet", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.entrySheet);
// Grade scale
resultRoutes.get("/grade-scale", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.getGradeScale);
resultRoutes.put("/grade-scale", (0, requirePermission_1.requirePermission)("settings:write"), results_controller_1.resultsController.upsertGradeScale);
// Sheets
resultRoutes.post("/sheets", (0, requirePermission_1.requirePermission)("results:write"), results_controller_1.resultsController.getOrCreateSheet);
resultRoutes.post("/sheets/bulk", (0, requirePermission_1.requirePermission)("results:write"), results_controller_1.resultsController.bulkCreateSheets);
// Scores
resultRoutes.post("/scores", (0, requirePermission_1.requirePermission)("results:write"), results_controller_1.resultsController.upsertScores);
resultRoutes.post("/scores/bulk", (0, requirePermission_1.requirePermission)("results:write"), results_controller_1.resultsController.bulkScores);
// Workflow
resultRoutes.patch("/:id/status", (0, requirePermission_1.requirePermission)("results:write"), results_controller_1.resultsController.transition);
resultRoutes.post("/publish-class", (0, requirePermission_1.requirePermission)("results:publish"), // stricter permission
results_controller_1.resultsController.publishClass);
resultRoutes.post("/recalculate-positions", (0, requirePermission_1.requirePermission)("results:publish"), results_controller_1.resultsController.recalculatePositions);
// Reads
resultRoutes.get("/", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.list);
resultRoutes.get("/:id", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.getOne);
resultRoutes.get("/:id/report-card", (0, requirePermission_1.requirePermission)("results:read"), results_controller_1.resultsController.reportCard);
exports.default = resultRoutes;
// import { Router } from "express";
// import { resultsController } from "./results.controller";
// import {
//   bulkScoresBodySchema,
//   classTermSubjectQuerySchema,
//   listResultsQuerySchema,
//   publishResultsBodySchema,
//   recalculatePositionsBodySchema,
//   resultIdParamSchema,
//   resultsStatsQuerySchema,
//   studentTermParamsSchema,
//   updateResultBodySchema,
//   upsertScoresBodySchema,
//   verifyResultBodySchema,
// } from "./results.dto";
// import { OrgRole } from "@prisma/client";
// import { authenticate } from "../../common/middleware/authenticate";
// import { validate } from "../../common/middleware/validate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { Role } from "../../common/types/auth";
// const staff: Role[] = [
//   OrgRole.SCHOOL_ADMIN as Role,
//   OrgRole.TEACHER as Role,
//   OrgRole.EXAM_OFFICER as Role,
// ];
// const publishers = [OrgRole.SCHOOL_ADMIN, OrgRole.EXAM_OFFICER] as Role[];
// const resultRoutes = Router();
// /**
//  * Public parent verify — mount at /api/v1/public/results (no auth).
//  * Keep rate limiting on this path.
//  */
// export const publicResultsRouter = Router();
// publicResultsRouter.post(
//   "/verify",
//   validate({ body: verifyResultBodySchema }),
//   resultsController.verifyPublic
// );
// /** School-scoped results API — mount at /api/v1/results */
// resultRoutes.use(authenticate, requireSchoolContext);
// resultRoutes.get(
//   "/",
//   authorize(...staff),
//   validate({ query: listResultsQuerySchema }),
//   resultsController.list
// );
// resultRoutes.get(
//   "/stats",
//   authorize(...staff),
//   validate({ query: resultsStatsQuerySchema }),
//   resultsController.stats
// );
// resultRoutes.get(
//   "/entry-sheet",
//   authorize(...staff),
//   validate({ query: classTermSubjectQuerySchema }),
//   resultsController.entrySheet
// );
// resultRoutes.get(
//   "/student/:studentId/term/:termId",
//   authorize(...staff),
//   validate({ params: studentTermParamsSchema }),
//   resultsController.getByStudentTerm
// );
// resultRoutes.put(
//   "/student/:studentId/term/:termId/scores",
//   authorize(...staff),
//   validate({ params: studentTermParamsSchema, body: upsertScoresBodySchema }),
//   resultsController.upsertStudentScores
// );
// resultRoutes.put(
//   "/bulk-scores",
//   authorize(...staff),
//   validate({ body: bulkScoresBodySchema }),
//   resultsController.bulkSubjectScores
// );
// resultRoutes.post(
//   "/publish",
//   authorize(...publishers),
//   validate({ body: publishResultsBodySchema }),
//   resultsController.publish
// );
// resultRoutes.post(
//   "/recalculate-positions",
//   authorize(...publishers),
//   validate({ body: recalculatePositionsBodySchema }),
//   resultsController.recalculatePositions
// );
// resultRoutes.get(
//   "/:id",
//   authorize(...staff),
//   validate({ params: resultIdParamSchema }),
//   resultsController.getById
// );
// resultRoutes.patch(
//   "/:id",
//   authorize(...staff),
//   validate({ params: resultIdParamSchema, body: updateResultBodySchema }),
//   resultsController.updateMeta
// );
// export default resultRoutes;
