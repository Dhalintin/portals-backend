import { Router } from "express";
import { staffController } from "./staff.controller";

import {
  bulkScoresBodySchema,
  classIdParamSchema,
  entrySheetQuerySchema,
} from "./staff.dto";
import { OrgRole } from "@prisma/client";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";

const staffRoutes = Router();

const staffRoles = [
  OrgRole.TEACHER,
  OrgRole.EXAM_OFFICER,
  OrgRole.SCHOOL_ADMIN,
];

staffRoutes.use(authenticate, requireSchoolContext);

/** GET /staff/me — dashboard: assignments + form classes */
staffRoutes.get("/me", authorize(...staffRoles), staffController.dashboard);

/** GET /staff/assignments — class+subject I teach */
staffRoutes.get(
  "/assignments",
  authorize(...staffRoles),
  staffController.assignments
);

/** GET /staff/classes/:classId — class detail if form teacher or I teach there */
staffRoutes.get(
  "/classes/:classId",
  authorize(...staffRoles),
  validate({ params: classIdParamSchema }),
  staffController.classDetail
);

/** GET /staff/classes/:classId/students */
staffRoutes.get(
  "/classes/:classId/students",
  authorize(...staffRoles),
  validate({ params: classIdParamSchema }),
  staffController.classRoster
);

/** GET /staff/entry-sheet?termId&classId&subjectId */
staffRoutes.get(
  "/entry-sheet",
  authorize(...staffRoles),
  validate({ query: entrySheetQuerySchema }),
  staffController.entrySheet
);

/** PUT /staff/scores — bulk upsert (subject teacher ACL) */
staffRoutes.put(
  "/scores",
  authorize(...staffRoles),
  validate({ body: bulkScoresBodySchema }),
  staffController.bulkScores
);

/** GET /staff/progress?termId&classId&subjectId */
staffRoutes.get(
  "/progress",
  authorize(...staffRoles),
  validate({ query: entrySheetQuerySchema }),
  staffController.progress
);

export default staffRoutes;
