import { Router } from "express";
import { pinsController } from "./pins.controller";
// import { authenticate } from "../../middleware/authenticate";
// import { authorize } from "../../middleware/authorize";
// import { requireSchoolContext } from "../../middleware/requireSchoolContext";
// import { validate } from "../../middleware/validate";
import {
  generatePinsBodySchema,
  listPinsQuerySchema,
  pinIdParamSchema,
  pinsStatsQuerySchema,
  updatePinBodySchema,
  verifyPinBodySchema,
} from "./pins.dto";
import { OrgRole } from "@prisma/client";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { authenticate } from "../../common/middleware/authenticate";
import { validate } from "../../common/middleware/validate";

const staff = [OrgRole.SCHOOL_ADMIN, OrgRole.TEACHER, OrgRole.EXAM_OFFICER];
const managers = [OrgRole.SCHOOL_ADMIN, OrgRole.EXAM_OFFICER];

const pinRoutes = Router();

/** Public — mount at /api/v1/public/pins (rate-limit this) */
export const publicPinsRouter = Router();
publicPinsRouter.post(
  "/verify",
  validate({ body: verifyPinBodySchema }),
  pinsController.verifyPublic
);

/** School-scoped — mount at /api/v1/pins */
pinRoutes.use(authenticate, requireSchoolContext);

pinRoutes.get(
  "/",
  authorize(...managers),
  validate({ query: listPinsQuerySchema }),
  pinsController.list
);

pinRoutes.get(
  "/stats",
  authorize(...managers),
  validate({ query: pinsStatsQuerySchema }),
  pinsController.stats
);

pinRoutes.post(
  "/generate",
  authorize(...managers),
  validate({ body: generatePinsBodySchema }),
  pinsController.generate
);

pinRoutes.get(
  "/:id",
  authorize(...managers),
  validate({ params: pinIdParamSchema }),
  pinsController.getById
);

pinRoutes.patch(
  "/:id",
  authorize(...managers),
  validate({ params: pinIdParamSchema, body: updatePinBodySchema }),
  pinsController.update
);

pinRoutes.post(
  "/:id/disable",
  authorize(...managers),
  validate({ params: pinIdParamSchema }),
  pinsController.disable
);

export default pinRoutes;
