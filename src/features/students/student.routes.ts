// src/features/students/student.routes.ts
import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";
import { studentController } from "./student.controller";
import {
  bulkCreateStudentsBodySchema,
  createStudentBodySchema,
  listStudentsQuerySchema,
  studentIdParamsSchema,
  updateStudentBodySchema,
} from "./student.dto";

const studentRoutes = Router();

studentRoutes.use(authenticate, requireSchoolContext);

studentRoutes.get(
  "/",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ query: listStudentsQuerySchema }),
  studentController.list
);

studentRoutes.post(
  "/",
  authorize("school_admin", "exam_officer"),
  validate({ body: createStudentBodySchema }),
  studentController.create
);

studentRoutes.post(
  "/bulk",
  authorize("school_admin", "exam_officer"),
  validate({ body: bulkCreateStudentsBodySchema }),
  studentController.bulkCreate
);

studentRoutes.get(
  "/:id",
  authorize("school_admin", "teacher", "exam_officer"),
  validate({ params: studentIdParamsSchema }),
  studentController.getById
);

studentRoutes.patch(
  "/:id",
  authorize("school_admin", "exam_officer"),
  validate({ params: studentIdParamsSchema, body: updateStudentBodySchema }),
  studentController.update
);

studentRoutes.delete(
  "/:id",
  authorize("school_admin"),
  validate({ params: studentIdParamsSchema }),
  studentController.remove
);

export default studentRoutes;
