import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  addClassSubjectSchema,
  assignClassTeacherSchema,
  assignSubjectTeacherSchema,
  classIdParamsSchema,
  classSubjectParamsSchema,
  createClassSchema,
  listClassesQuerySchema,
  updateClassSchema,
} from "./classes.validation";
import { ClassesController } from "./classes.controller";

const c = new ClassesController();
const classRoutes = Router();

classRoutes.use(authenticate, requireSchool);

classRoutes.get(
  "/",
  requirePermission(PERMISSIONS["classes:read"]),
  validate(listClassesQuerySchema, "query"),
  c.list
);

classRoutes.post(
  "/",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(createClassSchema),
  c.create
);

classRoutes.get(
  "/:classId",
  requirePermission(PERMISSIONS["classes:read"]),
  validate(classIdParamsSchema, "params"),
  c.get
);

classRoutes.patch(
  "/:classId",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classIdParamsSchema, "params"),
  validate(updateClassSchema),
  c.update
);

classRoutes.put(
  "/:classId/class-teacher",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classIdParamsSchema, "params"),
  validate(assignClassTeacherSchema),
  c.assignClassTeacher
);

classRoutes.get(
  "/:classId/subjects",
  requirePermission(PERMISSIONS["classes:read"]),
  validate(classIdParamsSchema, "params"),
  c.listSubjects
);

classRoutes.post(
  "/:classId/subjects",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classIdParamsSchema, "params"),
  validate(addClassSubjectSchema),
  c.addSubject
);

classRoutes.delete(
  "/:classId/subjects/:subjectId",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classSubjectParamsSchema, "params"),
  c.removeSubject
);

classRoutes.put(
  "/:classId/subjects/:subjectId/teacher",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classSubjectParamsSchema, "params"),
  validate(assignSubjectTeacherSchema),
  c.assignSubjectTeacher
);

classRoutes.delete(
  "/:classId/subjects/:subjectId/teacher",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(classSubjectParamsSchema, "params"),
  c.removeSubjectTeacher
);

export default classRoutes;

// // src/features/classes/class.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { classController } from "./classes.controller";
// import {
//   classIdParamsSchema,
//   createClassBodySchema,
//   listClassesQuerySchema,
//   updateClassBodySchema,
// } from "./classes.dto";

// import { classSubjectController } from "./classSubject.controller";
// import {
//   addClassSubjectBodySchema,
//   classIdForClassSubjectParamsSchema,
//   classSubjectParamsSchema,
//   setClassSubjectsBodySchema,
// } from "./classSubject.dto";
// import { Role } from "../../common/types/auth";

// const router = Router();

// router.use(authenticate, requireSchoolContext);

// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];

// router.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listClassesQuerySchema }),
//   classController.list
// );

// router.post(
//   "/",
//   authorize("SCHOOL_ADMIN"),
//   validate({ body: createClassBodySchema }),
//   classController.create
// );

// router.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: classIdParamsSchema }),
//   classController.getById
// );

// router.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: classIdParamsSchema, body: updateClassBodySchema }),
//   classController.update
// );

// router.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: classIdParamsSchema }),
//   classController.remove
// );

// // Class subject routes

// // In class.routes.ts (or separate router merged under /classes)

// router.get(
//   "/:classId/subjects",
//   authorize(...platformUsers),
//   validate({ params: classIdForClassSubjectParamsSchema }),
//   classSubjectController.list
// );

// router.put(
//   "/:classId/subjects",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({
//     params: classIdForClassSubjectParamsSchema,
//     body: setClassSubjectsBodySchema,
//   }),
//   classSubjectController.set
// );

// router.post(
//   "/:classId/subjects",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({
//     params: classIdForClassSubjectParamsSchema,
//     body: addClassSubjectBodySchema,
//   }),
//   classSubjectController.add
// );

// router.delete(
//   "/:classId/subjects/:subjectId",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: classIdForClassSubjectParamsSchema }),
//   classSubjectController.remove
// );

// export default router;
