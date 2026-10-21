import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { resultsController } from "./results.controller";
import { requireStaff } from "../../middlewares/requireStaff";

const resultRoutes = Router();

resultRoutes.use(authenticate, requireSchool);
resultRoutes.get("/parent/me", requirePermission("results:read"), resultsController.parentResults);
resultRoutes.get("/parent/report-cards/:id", requirePermission("results:read"), resultsController.parentReportCard);
resultRoutes.use(requireStaff);
resultRoutes.get("/entry-sheet", requirePermission("results:read"), resultsController.entrySheet);

// Grade scale
resultRoutes.get(
  "/grade-scale",
  requirePermission("results:read"),
  resultsController.getGradeScale
);
resultRoutes.put(
  "/grade-scale",
  requirePermission("settings:write"),
  resultsController.upsertGradeScale
);

// Sheets
resultRoutes.post(
  "/sheets",
  requirePermission("results:write"),
  resultsController.getOrCreateSheet
);
resultRoutes.post(
  "/sheets/bulk",
  requirePermission("results:write"),
  resultsController.bulkCreateSheets
);

// Scores
resultRoutes.post(
  "/scores",
  requirePermission("results:write"),
  resultsController.upsertScores
);
resultRoutes.post(
  "/scores/bulk",
  requirePermission("results:write"),
  resultsController.bulkScores
);

// Workflow
resultRoutes.patch(
  "/:id/status",
  requirePermission("results:write"),
  resultsController.transition
);
resultRoutes.post(
  "/publish-class",
  requirePermission("results:publish"), // stricter permission
  resultsController.publishClass
);
resultRoutes.post(
  "/recalculate-positions",
  requirePermission("results:publish"),
  resultsController.recalculatePositions
);

// Reads
resultRoutes.get(
  "/",
  requirePermission("results:read"),
  resultsController.list
);
resultRoutes.get(
  "/:id",
  requirePermission("results:read"),
  resultsController.getOne
);
resultRoutes.get(
  "/:id/report-card",
  requirePermission("results:read"),
  resultsController.reportCard
);

export default resultRoutes;

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
