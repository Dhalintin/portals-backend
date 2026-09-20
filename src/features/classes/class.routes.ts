// src/features/classes/class.routes.ts
import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";
import { classController } from "./class.controller";
import {
  classIdParamsSchema,
  createClassBodySchema,
  listClassesQuerySchema,
  updateClassBodySchema,
} from "./class.dto";

import { classSubjectController } from "./classSubject.controller";
import {
  addClassSubjectBodySchema,
  classIdForClassSubjectParamsSchema,
  classSubjectParamsSchema,
  setClassSubjectsBodySchema,
} from "./classSubject.dto";
import { Role } from "../../common/types/auth";

const router = Router();

router.use(authenticate, requireSchoolContext);

const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];

router.get(
  "/",
  authorize(...platformUsers),
  validate({ query: listClassesQuerySchema }),
  classController.list
);

router.post(
  "/",
  authorize("SCHOOL_ADMIN"),
  validate({ body: createClassBodySchema }),
  classController.create
);

router.get(
  "/:id",
  authorize(...platformUsers),
  validate({ params: classIdParamsSchema }),
  classController.getById
);

router.patch(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: classIdParamsSchema, body: updateClassBodySchema }),
  classController.update
);

router.delete(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: classIdParamsSchema }),
  classController.remove
);

// Class subject routes

// In class.routes.ts (or separate router merged under /classes)

router.get(
  "/:classId/subjects",
  authorize(...platformUsers),
  validate({ params: classIdForClassSubjectParamsSchema }),
  classSubjectController.list
);

router.put(
  "/:classId/subjects",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({
    params: classIdForClassSubjectParamsSchema,
    body: setClassSubjectsBodySchema,
  }),
  classSubjectController.set
);

router.post(
  "/:classId/subjects",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({
    params: classIdForClassSubjectParamsSchema,
    body: addClassSubjectBodySchema,
  }),
  classSubjectController.add
);

router.delete(
  "/:classId/subjects/:subjectId",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ params: classIdForClassSubjectParamsSchema }),
  classSubjectController.remove
);

export default router;
