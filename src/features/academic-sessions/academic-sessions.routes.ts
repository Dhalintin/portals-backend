import { Router } from "express";
import { academicSessionsController } from "./academic-sessions.controller";

import {
  createSessionBodySchema,
  listSessionsQuerySchema,
  sessionIdParamSchema,
  termIdParamSchema,
  updateSessionBodySchema,
  updateTermBodySchema,
} from "./academic-sessions.dto";
import { OrgRole } from "@prisma/client";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";
import { Role } from "../../common/types/auth";

const staff = [
  OrgRole.SCHOOL_ADMIN as Role,
  OrgRole.TEACHER as Role,
  OrgRole.EXAM_OFFICER as Role,
];
const managers = [OrgRole.SCHOOL_ADMIN, OrgRole.EXAM_OFFICER] as Role[];

const academicSessionRoutes = Router();

academicSessionRoutes.use(authenticate, requireSchoolContext);

/** GET /sessions — list with nested terms */
academicSessionRoutes.get(
  "/",
  authorize(...staff),
  validate({ query: listSessionsQuerySchema }),
  academicSessionsController.list
);

/** GET /sessions/current — default for Results page */
academicSessionRoutes.get(
  "/current",
  authorize(...staff),
  academicSessionsController.current
);

/** GET /sessions/terms/:termId — resolve one term */
academicSessionRoutes.get(
  "/terms/:termId",
  authorize(...staff),
  validate({ params: termIdParamSchema }),
  academicSessionsController.getTerm
);

/** PATCH /sessions/terms/:termId — set current term / dates */
academicSessionRoutes.patch(
  "/terms/:termId",
  authorize(...managers),
  validate({ params: termIdParamSchema, body: updateTermBodySchema }),
  academicSessionsController.updateTerm
);

academicSessionRoutes.get(
  "/:id",
  authorize(...staff),
  validate({ params: sessionIdParamSchema }),
  academicSessionsController.getById
);

academicSessionRoutes.post(
  "/",
  authorize(...managers),
  validate({ body: createSessionBodySchema }),
  academicSessionsController.create
);

academicSessionRoutes.patch(
  "/:id",
  authorize(...managers),
  validate({ params: sessionIdParamSchema, body: updateSessionBodySchema }),
  academicSessionsController.update
);

academicSessionRoutes.delete(
  "/:id",
  authorize(...managers),
  validate({ params: sessionIdParamSchema }),
  academicSessionsController.remove
);

export default academicSessionRoutes;
