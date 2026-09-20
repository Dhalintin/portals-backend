import { z } from "zod";

const orgStaffRole = z.enum(["TEACHER", "EXAM_OFFICER"]);

export const listTeachersQuerySchema = z.object({
  search: z.string().optional(),
  role: orgStaffRole.optional(),
  isActive: z.enum(["true", "false", "all"]).optional().default("true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  classTeacherAvailable: z.enum(["true", "false"]).optional(),
  includeUserId: z.string().uuid().optional(),
});

export const inviteTeacherBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z
    .string()
    .min(7)
    .max(20)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  role: orgStaffRole.optional().default("TEACHER"),
  /** If omitted, user is created without password (invite/Google/reset later) */
  temporaryPassword: z.string().min(8).max(128).optional(),
});

export const updateTeacherBodySchema = z
  .object({
    firstName: z.string().min(1).max(100).trim().optional(),
    lastName: z.string().min(1).max(100).trim().optional(),
    phone: z.string().min(7).max(20).trim().nullable().optional(),
    role: orgStaffRole.optional(),
    isActive: z.boolean().optional(), // membership isActive
  })
  .strict();

export const teacherIdParamsSchema = z.object({
  id: z.string().uuid(), // userId
});

/** Replace all subject assignments for this teacher */
export const setAssignmentsBodySchema = z.object({
  assignments: z.array(
    z.object({
      classId: z.string().uuid(),
      subjectId: z.string().uuid(),
    })
  ),
});

export const setClassTeacherBodySchema = z.object({
  teacherId: z.string().uuid().nullable(), // userId or null to clear
});

export const setClassSubjectTeacherBodySchema = z.object({
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().nullable(),
});

export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>;
export type InviteTeacherBody = z.infer<typeof inviteTeacherBodySchema>;
export type UpdateTeacherBody = z.infer<typeof updateTeacherBodySchema>;
export type SetAssignmentsBody = z.infer<typeof setAssignmentsBodySchema>;
export type SetClassTeacherBody = z.infer<typeof setClassTeacherBodySchema>;
export type SetClassSubjectTeacherBody = z.infer<
  typeof setClassSubjectTeacherBodySchema
>;
