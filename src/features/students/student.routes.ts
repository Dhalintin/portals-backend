import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  bulkCreateStudentsSchema,
  createStudentSchema,
  enrollStudentSchema,
  listStudentsQuerySchema,
  studentIdParamsSchema,
  updateStudentSchema,
} from "./students.validation";
import { StudentsController } from "./students.controller";

const c = new StudentsController();
const studentRoutes = Router();

studentRoutes.use(authenticate, requireSchool);

studentRoutes.get(
  "/",
  requirePermission(PERMISSIONS["students:read"]),
  validate(listStudentsQuerySchema, "query"),
  c.list
);

studentRoutes.get(
  "/export",
  requirePermission(PERMISSIONS["students:read"]),
  c.exportRows
);

studentRoutes.post(
  "/",
  requirePermission(PERMISSIONS["students:write"]),
  validate(createStudentSchema),
  c.create
);

studentRoutes.post(
  "/bulk",
  requirePermission(PERMISSIONS["students:write"]),
  validate(bulkCreateStudentsSchema),
  c.bulkCreate
);

studentRoutes.get(
  "/:studentId",
  requirePermission(PERMISSIONS["students:read"]),
  validate(studentIdParamsSchema, "params"),
  c.get
);

studentRoutes.patch(
  "/:studentId",
  requirePermission(PERMISSIONS["students:write"]),
  validate(studentIdParamsSchema, "params"),
  validate(updateStudentSchema),
  c.update
);

studentRoutes.post(
  "/:studentId/archive",
  requirePermission(PERMISSIONS["students:write"]),
  validate(studentIdParamsSchema, "params"),
  c.archive
);

studentRoutes.post(
  "/:studentId/enroll",
  requirePermission(PERMISSIONS["students:write"]),
  validate(studentIdParamsSchema, "params"),
  validate(enrollStudentSchema),
  c.enroll
);

export default studentRoutes;

// // src/features/students/student.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { studentController } from "./student.controller";
// import {
//   bulkCreateStudentsBodySchema,
//   createStudentBodySchema,
//   listStudentsQuerySchema,
//   studentIdParamsSchema,
//   updateStudentBodySchema,
// } from "./student.dto";
// import { Role } from "../../common/types/auth";

// const studentRoutes = Router();

// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];

// studentRoutes.use(authenticate, requireSchoolContext);

// studentRoutes.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listStudentsQuerySchema }),
//   studentController.list
// );

// studentRoutes.post(
//   "/",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: createStudentBodySchema }),
//   studentController.create
// );

// studentRoutes.post(
//   "/bulk",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: bulkCreateStudentsBodySchema }),
//   studentController.bulkCreate
// );

// studentRoutes.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: studentIdParamsSchema }),
//   studentController.getById
// );

// studentRoutes.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: studentIdParamsSchema, body: updateStudentBodySchema }),
//   studentController.update
// );

// studentRoutes.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: studentIdParamsSchema }),
//   studentController.remove
// );

// export default studentRoutes;
