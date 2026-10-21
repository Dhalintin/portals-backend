"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectIdParamsSchema = exports.updateSubjectSchema = exports.createSubjectSchema = exports.listSubjectsQuerySchema = void 0;
const zod_1 = require("zod");
exports.listSubjectsQuerySchema = zod_1.z.object({
    q: zod_1.z
        .string()
        .trim()
        .max(80, "Search query cannot exceed 80 characters")
        .optional(),
    isActive: zod_1.z
        .enum(["true", "false", "all"], "Active filter must be true, false, or all")
        .default("true")
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    page: zod_1.z.coerce
        .number("Page must be a number")
        .int("Page must be a whole number")
        .min(1, "Page must be at least 1")
        .default(1),
    limit: zod_1.z.coerce
        .number("Page size must be a number")
        .int("Page size must be a whole number")
        .min(1, "Page size must be at least 1")
        .max(100, "Page size cannot exceed 100")
        .default(50),
});
exports.createSubjectSchema = zod_1.z.object({
    name: zod_1.z
        .string({
        error: "Subject name must be text",
    })
        .trim()
        .min(1, "Subject name is required")
        .max(120, "Subject name cannot exceed 120 characters"),
    code: zod_1.z
        .string()
        .trim()
        .max(20, "Subject code cannot exceed 20 characters")
        .nullable()
        .optional(),
    isActive: zod_1.z.boolean().default(true).optional(),
});
exports.updateSubjectSchema = exports.createSubjectSchema.partial();
exports.subjectIdParamsSchema = zod_1.z.object({
    subjectId: zod_1.z.string().uuid("Please provide a valid subject ID"),
});
// import { z } from "zod";
// export const listSubjectsQuerySchema = z.object({
//   q: z.string().trim().max(80).optional(),
//   isActive: z
//     .enum(["true", "false", "all"])
//     .default("true")
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(50),
// });
// export const createSubjectSchema = z.object({
//   name: z.string().trim().min(1).max(120),
//   code: z.string().trim().max(20).nullable().optional(),
//   isActive: z.boolean().default(true).optional(),
// });
// export const updateSubjectSchema = createSubjectSchema.partial();
// export const subjectIdParamsSchema = z.object({
//   subjectId: z.string().uuid(),
// });
