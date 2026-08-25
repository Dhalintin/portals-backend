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

const router = Router();

router.use(authenticate, requireSchoolContext);

router.get(
  "/",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ query: listClassesQuerySchema }),
  classController.list
);

router.post(
  "/",
  authorize("school_admin"),
  validate({ body: createClassBodySchema }),
  classController.create
);

router.get(
  "/:id",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ params: classIdParamsSchema }),
  classController.getById
);

router.patch(
  "/:id",
  authorize("school_admin"),
  validate({ params: classIdParamsSchema, body: updateClassBodySchema }),
  classController.update
);

router.delete(
  "/:id",
  authorize("school_admin"),
  validate({ params: classIdParamsSchema }),
  classController.remove
);

export default router;
