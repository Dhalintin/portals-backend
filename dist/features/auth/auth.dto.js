"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAuthBodySchema = exports.switchOrganizationBodySchema = exports.changePasswordBodySchema = exports.resetPasswordBodySchema = exports.forgotPasswordBodySchema = exports.createOrganizationBodySchema = exports.registerBodySchema = exports.loginBodySchema = void 0;
// src/features/auth/auth.dto.ts
const zod_1 = require("zod");
exports.loginBodySchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim()),
    password: zod_1.z.string().min(1, "Password is required"),
    /** Required when the user belongs to more than one active school */
    surface: zod_1.z.enum(["platform", "school"]).optional().default("school"),
    organizationId: zod_1.z.string().uuid().optional(),
    organizationSlug: zod_1.z.string().min(1).max(80).optional(),
    // organizationId: z.string().uuid().optional(),
});
exports.registerBodySchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim()),
    password: zod_1.z.string().min(8).max(128),
    firstName: zod_1.z.string().min(1).max(100).trim(),
    lastName: zod_1.z.string().min(1).max(100).trim(),
    phone: zod_1.z
        .string()
        .min(7)
        .max(20)
        .optional()
        .transform((v) => (v ? v.trim() : undefined)),
    organizationName: zod_1.z.string().min(2).max(200).trim(),
    slug: zod_1.z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
});
exports.createOrganizationBodySchema = zod_1.z.object({
    organizationName: zod_1.z.string().min(2).max(200).trim(),
    slug: zod_1.z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
    phone: zod_1.z.string().min(7).max(20).optional(),
    email: zod_1.z.string().email().optional(),
});
exports.forgotPasswordBodySchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim()),
});
exports.resetPasswordBodySchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    password: zod_1.z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128),
});
exports.changePasswordBodySchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128),
});
exports.switchOrganizationBodySchema = zod_1.z.object({
    organizationId: zod_1.z.string().uuid(),
});
exports.googleAuthBodySchema = zod_1.z.object({
    idToken: zod_1.z.string().min(1),
    /** Same as login: required when user has multiple active memberships */
    organizationId: zod_1.z.string().uuid().optional(),
});
