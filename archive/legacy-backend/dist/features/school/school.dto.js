"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSchoolBodySchema = void 0;
// src/features/schools/school.dto.ts
const zod_1 = require("zod");
exports.updateSchoolBodySchema = zod_1.z
    .object({
    name: zod_1.z.string().min(2).max(200).trim().optional(),
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim())
        .nullable()
        .optional(),
    phone: zod_1.z.string().min(7).max(20).trim().nullable().optional(),
    logoUrl: zod_1.z.string().url().max(500).nullable().optional(),
    primaryColor: zod_1.z
        .string()
        .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Invalid hex color")
        .optional(),
    accentColor: zod_1.z
        .string()
        .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Invalid hex color")
        .optional(),
    address: zod_1.z.string().max(500).trim().nullable().optional(),
    city: zod_1.z.string().max(100).trim().nullable().optional(),
    state: zod_1.z.string().max(100).trim().nullable().optional(),
    country: zod_1.z.string().max(100).trim().optional(),
    motto: zod_1.z.string().max(300).trim().nullable().optional(),
    schoolType: zod_1.z.string().max(100).trim().nullable().optional(),
    // slug / isActive: not editable here (platform or dedicated flow later)
})
    .strict();
