"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAuthBodySchema = exports.switchOrganizationBodySchema = exports.changePasswordBodySchema = exports.resetPasswordBodySchema = exports.forgotPasswordBodySchema = exports.createOrganizationBodySchema = exports.registerBodySchema = exports.loginBodySchema = void 0;
// src/features/auth/auth.dto.ts
const zod_1 = require("zod");
/**
 * Client rules:
 * - Host WITHOUT school slug (localhost:3000, app.portals.com)
 *     → surface: "platform" (or omit org fields)
 * - Host WITH school slug (grace-international.localhost:3000)
 *     → surface: "school" + organizationSlug from host (required)
 */
exports.loginBodySchema = zod_1.z
    .object({
    email: zod_1.z
        .string()
        .email()
        .transform((v) => v.toLowerCase().trim()),
    password: zod_1.z.string().min(1, "Password is required"),
    surface: zod_1.z.enum(["platform", "school"]),
    organizationId: zod_1.z.string().uuid().optional(),
    organizationSlug: zod_1.z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
})
    .superRefine((val, ctx) => {
    if (val.surface === "platform") {
        if (val.organizationId || val.organizationSlug) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Platform sign-in must not include organizationId or organizationSlug",
                path: ["organizationSlug"],
            });
        }
        return;
    }
    // surface === "school"
    if (!val.organizationId && !val.organizationSlug) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "School sign-in requires organizationSlug (from subdomain) or organizationId",
            path: ["organizationSlug"],
        });
    }
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
exports.googleAuthBodySchema = zod_1.z
    .object({
    idToken: zod_1.z.string().min(1),
    surface: zod_1.z.enum(["platform", "school"]),
    organizationId: zod_1.z.string().uuid().optional(),
    organizationSlug: zod_1.z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
})
    .superRefine((val, ctx) => {
    if (val.surface === "platform") {
        if (val.organizationId || val.organizationSlug) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Platform sign-in must not include organization fields",
                path: ["organizationSlug"],
            });
        }
        return;
    }
    if (!val.organizationId && !val.organizationSlug) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "School sign-in requires organizationSlug or organizationId",
            path: ["organizationSlug"],
        });
    }
});
