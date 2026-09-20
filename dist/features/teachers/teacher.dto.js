"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setClassSubjectTeacherBodySchema = exports.setClassTeacherBodySchema = exports.setAssignmentsBodySchema = exports.teacherIdParamsSchema = exports.updateTeacherBodySchema = exports.inviteTeacherBodySchema = exports.listTeachersQuerySchema = void 0;
const zod_1 = require("zod");
const orgStaffRole = zod_1.z.enum(["TEACHER", "EXAM_OFFICER"]);
exports.listTeachersQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    role: orgStaffRole.optional(),
    isActive: zod_1.z.enum(["true", "false", "all"]).optional().default("true"),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
    classTeacherAvailable: zod_1.z.enum(["true", "false"]).optional(),
    includeUserId: zod_1.z.string().uuid().optional(),
});
exports.inviteTeacherBodySchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim()),
    firstName: zod_1.z.string().min(1).max(100).trim(),
    lastName: zod_1.z.string().min(1).max(100).trim(),
    phone: zod_1.z
        .string()
        .min(7)
        .max(20)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    role: orgStaffRole.optional().default("TEACHER"),
    /** If omitted, user is created without password (invite/Google/reset later) */
    temporaryPassword: zod_1.z.string().min(8).max(128).optional(),
});
exports.updateTeacherBodySchema = zod_1.z
    .object({
    firstName: zod_1.z.string().min(1).max(100).trim().optional(),
    lastName: zod_1.z.string().min(1).max(100).trim().optional(),
    phone: zod_1.z.string().min(7).max(20).trim().nullable().optional(),
    role: orgStaffRole.optional(),
    isActive: zod_1.z.boolean().optional(), // membership isActive
})
    .strict();
exports.teacherIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(), // userId
});
/** Replace all subject assignments for this teacher */
exports.setAssignmentsBodySchema = zod_1.z.object({
    assignments: zod_1.z.array(zod_1.z.object({
        classId: zod_1.z.string().uuid(),
        subjectId: zod_1.z.string().uuid(),
    })),
});
exports.setClassTeacherBodySchema = zod_1.z.object({
    teacherId: zod_1.z.string().uuid().nullable(), // userId or null to clear
});
exports.setClassSubjectTeacherBodySchema = zod_1.z.object({
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid().nullable(),
});
