"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTermBodySchema = exports.updateSessionBodySchema = exports.createSessionBodySchema = exports.termIdParamSchema = exports.sessionIdParamSchema = exports.listSessionsQuerySchema = void 0;
const zod_1 = require("zod");
const uuid = zod_1.z.string().uuid();
exports.listSessionsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
exports.sessionIdParamSchema = zod_1.z.object({
    id: uuid,
});
exports.termIdParamSchema = zod_1.z.object({
    termId: uuid,
});
exports.createSessionBodySchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(4, "e.g. 2025/2026")
        .max(32)
        .regex(/^\d{4}\/\d{4}$/, "Use format YYYY/YYYY e.g. 2025/2026"),
    startDate: zod_1.z.coerce.date().optional().nullable(),
    endDate: zod_1.z.coerce.date().optional().nullable(),
    /** If true, marks this session current and clears others in the school */
    isCurrent: zod_1.z.boolean().optional().default(false),
    /** Create FIRST / SECOND / THIRD terms automatically (default true) */
    createDefaultTerms: zod_1.z.boolean().optional().default(true),
});
exports.updateSessionBodySchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(4)
        .max(32)
        .regex(/^\d{4}\/\d{4}$/, "Use format YYYY/YYYY e.g. 2025/2026")
        .optional(),
    startDate: zod_1.z.coerce.date().optional().nullable(),
    endDate: zod_1.z.coerce.date().optional().nullable(),
    isCurrent: zod_1.z.boolean().optional(),
});
exports.updateTermBodySchema = zod_1.z.object({
    startDate: zod_1.z.coerce.date().optional().nullable(),
    endDate: zod_1.z.coerce.date().optional().nullable(),
    isCurrent: zod_1.z.boolean().optional(),
});
