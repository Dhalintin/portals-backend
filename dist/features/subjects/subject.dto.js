"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectIdParamsSchema = exports.listSubjectsQuerySchema = exports.updateSubjectBodySchema = exports.createSubjectBodySchema = void 0;
const zod_1 = require("zod");
exports.createSubjectBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120).trim(),
    code: zod_1.z
        .string()
        .max(30)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
});
exports.updateSubjectBodySchema = zod_1.z
    .object({
    name: zod_1.z.string().min(1).max(120).trim().optional(),
    code: zod_1.z
        .string()
        .max(30)
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v)),
    isActive: zod_1.z.boolean().optional(),
})
    .strict();
exports.listSubjectsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    isActive: zod_1.z.enum(["true", "false", "all"]).optional().default("true"),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).optional().default(50),
});
exports.subjectIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
