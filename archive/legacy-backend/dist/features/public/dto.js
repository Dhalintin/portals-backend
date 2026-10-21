"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPublicSchoolsQuerySchema = exports.verifyResultSchema = void 0;
const zod_1 = require("zod");
/**
 * Public result verification (no auth).
 * Serial = Pin.id (printed on card). Code = Pin.code.
 * Organization is resolved by slug (subdomain / body).
 */
exports.verifyResultSchema = zod_1.z.object({
    organizationSlug: zod_1.z
        .string()
        .min(1, "School is required")
        .max(120)
        .transform((s) => s.trim().toLowerCase()),
    admissionNumber: zod_1.z
        .string()
        .min(1, "Admission number is required")
        .max(64)
        .transform((s) => s.trim()),
    /** Serial printed on card = Pin.id */
    serial: zod_1.z
        .string()
        .min(1, "Serial number is required")
        .max(64)
        .transform((s) => s.trim()),
    /** PIN code printed on card = Pin.code */
    code: zod_1.z
        .string()
        .min(1, "PIN is required")
        .max(64)
        .transform((s) => s.trim()),
});
exports.listPublicSchoolsQuerySchema = zod_1.z.object({
    q: zod_1.z
        .string()
        .trim()
        .max(120)
        .optional()
        .transform((v) => (v && v.length > 0 ? v : undefined)),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).optional().default(20),
});
