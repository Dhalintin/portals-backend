import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";
import { subjectController } from "./subject.controller";
import {
  createSubjectBodySchema,
  listSubjectsQuerySchema,
  subjectIdParamsSchema,
  updateSubjectBodySchema,
} from "./subject.dto";
import { Role } from "../../common/types/auth";

const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];
const subjectRoutes = Router();

subjectRoutes.use(authenticate, requireSchoolContext);

subjectRoutes.get(
  "/",
  authorize(...platformUsers),
  validate({ query: listSubjectsQuerySchema }),
  subjectController.list
);

subjectRoutes.post(
  "/",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ body: createSubjectBodySchema }),
  subjectController.create
);

subjectRoutes.get(
  "/:id",
  authorize(...platformUsers),
  validate({ params: subjectIdParamsSchema }),
  subjectController.getById
);

subjectRoutes.patch(
  "/:id",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ params: subjectIdParamsSchema, body: updateSubjectBodySchema }),
  subjectController.update
);

subjectRoutes.delete(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: subjectIdParamsSchema }),
  subjectController.remove
);

export default subjectRoutes;
