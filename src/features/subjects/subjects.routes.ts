import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  subjectIdParamsSchema,
  updateSubjectSchema,
} from "./subjects.validation";
import { SubjectsController } from "./subjects.controller";

const c = new SubjectsController();
const subjectsRoutes = Router();

subjectsRoutes.use(authenticate, requireSchool);

subjectsRoutes.get(
  "/",
  requirePermission(PERMISSIONS["classes:read"]),
  validate(listSubjectsQuerySchema, "query"),
  c.list
);

subjectsRoutes.post(
  "/",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(createSubjectSchema),
  c.create
);

subjectsRoutes.get(
  "/:subjectId",
  requirePermission(PERMISSIONS["classes:read"]),
  validate(subjectIdParamsSchema, "params"),
  c.get
);

subjectsRoutes.patch(
  "/:subjectId",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(subjectIdParamsSchema, "params"),
  validate(updateSubjectSchema),
  c.update
);

subjectsRoutes.post(
  "/:subjectId/archive",
  requirePermission(PERMISSIONS["classes:write"]),
  validate(subjectIdParamsSchema, "params"),
  c.archive
);

export default subjectsRoutes;

// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import {
//   authorize,
//   requireSchoolContext,
// } from "../../common/middleware/authorize";
// import { validate } from "../../common/middleware/validate";
// import { subjectController } from "./subjects.controller";
// import {
//   createSubjectBodySchema,
//   listSubjectsQuerySchema,
//   subjectIdParamsSchema,
//   updateSubjectBodySchema,
// } from "./subject.dto";
// import { Role } from "../../common/types/auth";

// const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];
// const subjectRoutes = Router();

// subjectRoutes.use(authenticate, requireSchoolContext);

// subjectRoutes.get(
//   "/",
//   authorize(...platformUsers),
//   validate({ query: listSubjectsQuerySchema }),
//   subjectController.list
// );

// subjectRoutes.post(
//   "/",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ body: createSubjectBodySchema }),
//   subjectController.create
// );

// subjectRoutes.get(
//   "/:id",
//   authorize(...platformUsers),
//   validate({ params: subjectIdParamsSchema }),
//   subjectController.getById
// );

// subjectRoutes.patch(
//   "/:id",
//   authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
//   validate({ params: subjectIdParamsSchema, body: updateSubjectBodySchema }),
//   subjectController.update
// );

// subjectRoutes.delete(
//   "/:id",
//   authorize("SCHOOL_ADMIN"),
//   validate({ params: subjectIdParamsSchema }),
//   subjectController.remove
// );

// export default subjectRoutes;
