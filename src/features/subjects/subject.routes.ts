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

const subjectRoutes = Router();

subjectRoutes.use(authenticate, requireSchoolContext);

subjectRoutes.get(
  "/",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ query: listSubjectsQuerySchema }),
  subjectController.list
);

subjectRoutes.post(
  "/",
  authorize("school_admin", "exam_officer"),
  validate({ body: createSubjectBodySchema }),
  subjectController.create
);

subjectRoutes.get(
  "/:id",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ params: subjectIdParamsSchema }),
  subjectController.getById
);

subjectRoutes.patch(
  "/:id",
  authorize("school_admin", "exam_officer"),
  validate({ params: subjectIdParamsSchema, body: updateSubjectBodySchema }),
  subjectController.update
);

subjectRoutes.delete(
  "/:id",
  authorize("school_admin"),
  validate({ params: subjectIdParamsSchema }),
  subjectController.remove
);

export default subjectRoutes;
