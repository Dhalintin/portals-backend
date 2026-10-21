"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignSubjectTeacherSchema = exports.classSubjectParamsSchema = exports.addClassSubjectSchema = exports.assignClassTeacherSchema = exports.classIdParamsSchema = exports.updateClassSchema = exports.createClassSchema = exports.listClassesQuerySchema = void 0;
const zod_1 = require("zod");
exports.listClassesQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().max(80, "Must not exceed 80 characters.").optional(),
    isActive: zod_1.z
        .enum(["true", "false"])
        .default("true")
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    page: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .default(1),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100, "Must not exceed 100.")
        .default(50),
});
exports.createClassSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    arm: zod_1.z
        .string()
        .trim()
        .max(40, "Must not exceed 40 characters.")
        .nullable()
        .optional(),
    level: zod_1.z
        .string()
        .trim()
        .max(40, "Must not exceed 40 characters.")
        .nullable()
        .optional(),
    isActive: zod_1.z.boolean().default(true).optional(),
    classTeacherId: zod_1.z
        .string()
        .uuid("Please provide a valid ID.")
        .nullable()
        .optional(),
});
exports.updateClassSchema = exports.createClassSchema.partial();
exports.classIdParamsSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid("Please provide a valid ID."),
});
exports.assignClassTeacherSchema = zod_1.z.object({
    classTeacherId: zod_1.z.string().uuid("Please provide a valid ID.").nullable(),
});
exports.addClassSubjectSchema = zod_1.z.object({
    subjectIds: zod_1.z.array(zod_1.z.string().uuid("Please provide a valid ID.")),
});
exports.classSubjectParamsSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid("Please provide a valid ID."),
    subjectId: zod_1.z.string().uuid("Please provide a valid ID."),
});
exports.assignSubjectTeacherSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid("Please provide a valid ID."),
});
// import { z } from "zod";
// export const listClassesQuerySchema = z.object({
//   q: z.string().trim().max(80).optional(),
//   isActive: z
//     .enum(["true", "false"])
//     .default("true")
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(50),
// });
// export const createClassSchema = z.object({
//   name: z.string().trim().min(1).max(80),
//   arm: z.string().trim().max(40).nullable().optional(),
//   level: z.string().trim().max(40).nullable().optional(),
//   isActive: z.boolean().default(true).optional(),
//   classTeacherId: z.string().uuid().nullable().optional(),
// });
// export const updateClassSchema = createClassSchema.partial();
// export const classIdParamsSchema = z.object({
//   classId: z.string().uuid(),
// });
// export const assignClassTeacherSchema = z.object({
//   classTeacherId: z.string().uuid().nullable(),
// });
// export const addClassSubjectSchema = z.object({
//   subjectIds: z.array(z.string().uuid()),
// });
// export const classSubjectParamsSchema = z.object({
//   classId: z.string().uuid(),
//   subjectId: z.string().uuid(),
// });
// export const assignSubjectTeacherSchema = z.object({
//   userId: z.string().uuid(),
// });
