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
import { Role } from "../../common/types/auth";

const studentRoutes = Router();

const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];

studentRoutes.use(authenticate, requireSchoolContext);

studentRoutes.get(
  "/",
  authorize(...platformUsers),
  validate({ query: listStudentsQuerySchema }),
  studentController.list
);

studentRoutes.post(
  "/",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ body: createStudentBodySchema }),
  studentController.create
);

studentRoutes.post(
  "/bulk",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ body: bulkCreateStudentsBodySchema }),
  studentController.bulkCreate
);

studentRoutes.get(
  "/:id",
  authorize(...platformUsers),
  validate({ params: studentIdParamsSchema }),
  studentController.getById
);

studentRoutes.patch(
  "/:id",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ params: studentIdParamsSchema, body: updateStudentBodySchema }),
  studentController.update
);

studentRoutes.delete(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: studentIdParamsSchema }),
  studentController.remove
);

export default studentRoutes;
