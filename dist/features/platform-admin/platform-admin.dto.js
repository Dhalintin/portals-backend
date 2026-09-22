"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPlatformAdminsQuerySchema = exports.listPinsForSchoolQuerySchema = exports.generatePinsForSchoolBodySchema = exports.unassignSchoolBodySchema = exports.assignSchoolsBodySchema = exports.createPlatformAdminBodySchema = exports.orgIdParamSchema = exports.listSchoolsQuerySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.listSchoolsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().trim().max(120).optional(),
    isActive: zod_1.z.enum(["true", "false", "all"]).default("all"),
});
exports.orgIdParamSchema = zod_1.z.object({
    organizationId: zod_1.z.string().uuid(),
});
exports.createPlatformAdminBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    firstName: zod_1.z.string().trim().min(1).max(80),
    lastName: zod_1.z.string().trim().min(1).max(80),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    temporaryPassword: zod_1.z.string().min(8).max(72).optional(),
});
exports.assignSchoolsBodySchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    organizationIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(50),
    note: zod_1.z.string().trim().max(300).optional().nullable(),
});
exports.unassignSchoolBodySchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    organizationId: zod_1.z.string().uuid(),
});
exports.generatePinsForSchoolBodySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
    quantity: zod_1.z.coerce.number().int().min(1).max(500),
    expiresAt: zod_1.z.string().datetime().optional().nullable(),
});
exports.listPinsForSchoolQuerySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    status: zod_1.z.nativeEnum(client_1.PinStatus).optional(),
    /** Platform print: return full codes (default true for platform admin) */
    includeCodes: zod_1.z
        .enum(["true", "false"])
        .default("true")
        .transform((v) => v === "true"),
});
exports.listPlatformAdminsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    search: zod_1.z.string().trim().max(120).optional(),
});
