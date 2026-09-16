"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkCreateStudentsBodySchema = exports.studentIdParamsSchema = exports.listStudentsQuerySchema = exports.updateStudentBodySchema = exports.createStudentBodySchema = void 0;
// src/features/students/student.dto.ts
const zod_1 = require("zod");
const genderSchema = zod_1.z.enum(["MALE", "FEMALE", "OTHER"]);
exports.createStudentBodySchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).max(100).trim(),
    lastName: zod_1.z.string().min(1).max(100).trim(),
    otherNames: zod_1.z
        .string()
        .max(100)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    /** Blank → server generates unique admission number for the school */
    admissionNumber: zod_1.z
        .string()
        .max(50)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    gender: genderSchema.optional().nullable(),
    classId: zod_1.z.string().uuid().optional().nullable(),
    parentPhone: zod_1.z
        .string()
        .max(20)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    parentEmail: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim())
        .optional()
        .nullable()
        .or(zod_1.z.literal("").transform(() => null)),
});
exports.updateStudentBodySchema = zod_1.z
    .object({
    firstName: zod_1.z.string().min(1).max(100).trim().optional(),
    lastName: zod_1.z.string().min(1).max(100).trim().optional(),
    otherNames: zod_1.z
        .string()
        .max(100)
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v)),
    admissionNumber: zod_1.z.string().min(1).max(50).trim().optional(),
    gender: genderSchema.nullable().optional(),
    classId: zod_1.z.string().uuid().nullable().optional(),
    parentPhone: zod_1.z
        .string()
        .max(20)
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v)),
    parentEmail: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim())
        .nullable()
        .optional()
        .or(zod_1.z.literal("").transform(() => null)),
    isActive: zod_1.z.boolean().optional(),
})
    .strict();
exports.listStudentsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    classId: zod_1.z.string().uuid().optional(),
    gender: genderSchema.optional(),
    isActive: zod_1.z.enum(["true", "false", "all"]).optional().default("true"),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
});
exports.studentIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.bulkCreateStudentsBodySchema = zod_1.z.object({
    students: zod_1.z
        .array(exports.createStudentBodySchema)
        .min(1, "At least one student required")
        .max(500, "Max 500 students per bulk import"),
});
