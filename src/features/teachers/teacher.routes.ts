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

const classIdParams = z.object({ classId: z.string().uuid() });

const teacherRoutes = Router();

teacherRoutes.use(authenticate, requireSchoolContext);

teacherRoutes.get(
  "/",
  authorize("school_admin", "exam_officer"),
  validate({ query: listTeachersQuerySchema }),
  teacherController.list
);

teacherRoutes.post(
  "/invite",
  authorize("school_admin"),
  validate({ body: inviteTeacherBodySchema }),
  teacherController.invite
);

teacherRoutes.get(
  "/me/assignments",
  authorize("school_admin", "teacher", "exam_officer"),
  teacherController.myAssignments
);

// Class staffing (used by class detail Teachers tab)
teacherRoutes.put(
  "/classes/:classId/class-teacher",
  authorize("school_admin"),
  validate({
    params: classIdParams,
    body: setClassTeacherBodySchema,
  }),
  teacherController.setClassTeacher
);

teacherRoutes.get(
  "/classes/:classId/subject-teachers",
  authorize("school_admin", "exam_officer"),
  validate({ params: classIdParams }),
  teacherController.listClassSubjectTeachers
);

teacherRoutes.put(
  "/classes/:classId/subject-teachers",
  authorize("school_admin"),
  validate({
    params: classIdParams,
    body: setClassSubjectTeacherBodySchema,
  }),
  teacherController.setClassSubjectTeacher
);

teacherRoutes.get(
  "/:id",
  authorize("school_admin", "exam_officer"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.getById
);

teacherRoutes.patch(
  "/:id",
  authorize("school_admin"),
  validate({ params: teacherIdParamsSchema, body: updateTeacherBodySchema }),
  teacherController.update
);

teacherRoutes.delete(
  "/:id",
  authorize("school_admin"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.remove
);

teacherRoutes.put(
  "/:id/assignments",
  authorize("school_admin"),
  validate({ params: teacherIdParamsSchema, body: setAssignmentsBodySchema }),
  teacherController.setAssignments
);

export default teacherRoutes;
