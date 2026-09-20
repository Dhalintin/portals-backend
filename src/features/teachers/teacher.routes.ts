import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { validate } from "../../common/middleware/validate";
import { teacherController } from "./teacher.controller";
import {
  inviteTeacherBodySchema,
  listTeachersQuerySchema,
  setAssignmentsBodySchema,
  setClassSubjectTeacherBodySchema,
  setClassTeacherBodySchema,
  teacherIdParamsSchema,
  updateTeacherBodySchema,
} from "./teacher.dto";
import { z } from "zod";
import { Role } from "../../common/types/auth";

const classIdParams = z.object({ classId: z.string().uuid() });

const platformUsers = ["SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"] as Role[];

const teacherRoutes = Router();

teacherRoutes.use(authenticate, requireSchoolContext);

teacherRoutes.get(
  "/",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ query: listTeachersQuerySchema }),
  teacherController.list
);

teacherRoutes.post(
  "/invite",
  authorize("SCHOOL_ADMIN"),
  validate({ body: inviteTeacherBodySchema }),
  teacherController.invite
);

teacherRoutes.get(
  "/me/assignments",
  authorize(...platformUsers),
  teacherController.myAssignments
);

// Class staffing (used by class detail Teachers tab)
teacherRoutes.put(
  "/classes/:classId/class-teacher",
  authorize("SCHOOL_ADMIN"),
  validate({
    params: classIdParams,
    body: setClassTeacherBodySchema,
  }),
  teacherController.setClassTeacher
);

teacherRoutes.get(
  "/classes/:classId/subject-teachers",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ params: classIdParams }),
  teacherController.listClassSubjectTeachers
);

teacherRoutes.put(
  "/classes/:classId/subject-teachers",
  authorize("SCHOOL_ADMIN"),
  validate({
    params: classIdParams,
    body: setClassSubjectTeacherBodySchema,
  }),
  teacherController.setClassSubjectTeacher
);

teacherRoutes.get(
  "/:id",
  authorize("SCHOOL_ADMIN", "EXAM_OFFICER"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.getById
);

teacherRoutes.patch(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: teacherIdParamsSchema, body: updateTeacherBodySchema }),
  teacherController.update
);

teacherRoutes.delete(
  "/:id",
  authorize("SCHOOL_ADMIN"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.remove
);

teacherRoutes.put(
  "/:id/assignments",
  authorize("SCHOOL_ADMIN"),
  validate({ params: teacherIdParamsSchema, body: setAssignmentsBodySchema }),
  teacherController.setAssignments
);

export default teacherRoutes;
