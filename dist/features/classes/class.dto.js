"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classIdParamsSchema = exports.listClassesQuerySchema = exports.updateClassBodySchema = exports.createClassBodySchema = void 0;
// src/features/classes/class.dto.ts
const zod_1 = require("zod");
exports.createClassBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50).trim(), // "JSS 2", "SSS 1"
    arm: zod_1.z
        .string()
        .max(50)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
    level: zod_1.z
        .string()
        .max(100)
        .trim()
        .optional()
        .nullable()
        .transform((v) => (v === "" || v === undefined ? null : v)),
});
exports.updateClassBodySchema = zod_1.z
    .object({
    name: zod_1.z.string().min(1).max(50).trim().optional(),
    arm: zod_1.z
        .string()
        .max(50)
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v)),
    level: zod_1.z
        .string()
        .max(100)
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v)),
    isActive: zod_1.z.boolean().optional(),
})
    .strict();
exports.listClassesQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    level: zod_1.z.string().optional(),
    isActive: zod_1.z.enum(["true", "false", "all"]).optional().default("true"),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).optional().default(50),
});
exports.classIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
