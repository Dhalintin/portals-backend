import { requireStaffManager } from "../../middlewares/requireStaffManager";
import { Router } from "express";
import { validate as validateSource } from "../../middlewares/validate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requireStaff } from "../../middlewares/requireStaff";
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
import { invitationLimiter } from "../../middlewares/rateLimit";
import { authenticate } from "../../middlewares/authenticate";
import { PERMISSIONS } from "../../auth/permissions";
import { requirePermission } from "../../middlewares/requirePermission";

const classIdParams = z.object({ classId: z.string().uuid() });



const validate = (schemas: { body?: z.ZodTypeAny; query?: z.ZodTypeAny; params?: z.ZodTypeAny }) =>
  Object.entries(schemas).map(([source, schema]) => validateSource(schema, source as "body" | "query" | "params"));
const teacherRoutes = Router();

teacherRoutes.use(authenticate, requireSchool, requireStaff);

teacherRoutes.get(
  "/",
  requireStaffManager,
  requirePermission(PERMISSIONS["staff:read"]),
  validate({ query: listTeachersQuerySchema }),
  teacherController.list
);

teacherRoutes.post(
  "/invite",
  requireStaffManager,
  requirePermission("staff:write"),
  invitationLimiter,
  validate({ body: inviteTeacherBodySchema }),
  teacherController.invite
);

teacherRoutes.get(
  "/me/assignments",
  requirePermission("classes:read"),
  teacherController.myAssignments
);

// Class staffing (used by class detail Teachers tab)
teacherRoutes.put(
  "/classes/:classId/class-teacher",
  requireStaffManager,
  requirePermission("staff:write"),
  validate({
    params: classIdParams,
    body: setClassTeacherBodySchema,
  }),
  teacherController.setClassTeacher
);

teacherRoutes.get(
  "/classes/:classId/subject-teachers",
  requireStaffManager,
  requirePermission("staff:read"),
  validate({ params: classIdParams }),
  teacherController.listClassSubjectTeachers
);

teacherRoutes.put(
  "/classes/:classId/subject-teachers",
  requireStaffManager,
  requirePermission("staff:write"),
  validate({
    params: classIdParams,
    body: setClassSubjectTeacherBodySchema,
  }),
  teacherController.setClassSubjectTeacher
);

teacherRoutes.get(
  "/:id",
  requireStaffManager,
  requirePermission("staff:read"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.getById
);

teacherRoutes.patch(
  "/:id",
  requireStaffManager,
  requirePermission("staff:write"),
  validate({ params: teacherIdParamsSchema, body: updateTeacherBodySchema }),
  teacherController.update
);

teacherRoutes.delete(
  "/:id",
  requireStaffManager,
  requirePermission("staff:write"),
  validate({ params: teacherIdParamsSchema }),
  teacherController.remove
);

teacherRoutes.put(
  "/:id/assignments",
  requireStaffManager,
  requirePermission("staff:write"),
  validate({ params: teacherIdParamsSchema, body: setAssignmentsBodySchema }),
  teacherController.setAssignments
);

export default teacherRoutes;



