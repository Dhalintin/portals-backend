"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlatformUserSchema = exports.assignPlatformAdminSchema = exports.updateSubscriptionSchema = exports.updateSchoolStatusSchema = exports.listSchoolsQuerySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.listSchoolsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().max(100, "Must not exceed 100 characters.").optional(),
    isActive: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    plan: zod_1.z
        .nativeEnum(client_1.SubscriptionPlan, {
        error: "Please select a valid subscription plan.",
    })
        .optional(),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100, "Must not exceed 100.")
        .default(20),
    cursor: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
});
exports.updateSchoolStatusSchema = zod_1.z.object({
    isActive: zod_1.z.boolean(),
    reason: zod_1.z.string().max(500, "Must not exceed 500 characters.").optional(),
});
exports.updateSubscriptionSchema = zod_1.z.object({
    plan: zod_1.z
        .nativeEnum(client_1.SubscriptionPlan, {
        error: "Please select a valid subscription plan.",
    })
        .optional(),
    status: zod_1.z
        .nativeEnum(client_1.SubscriptionStatus, {
        error: "Please select a valid subscription status.",
    })
        .optional(),
    studentCap: zod_1.z
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100_000, "Must not exceed 100_000.")
        .optional(),
    sponsorship: zod_1.z
        .nativeEnum(client_1.SponsorshipModel, {
        error: "Please select a valid sponsorship model.",
    })
        .optional(),
    currentPeriodEnd: zod_1.z
        .string()
        .datetime("Please provide a valid date and time.")
        .optional()
        .nullable(),
});
exports.assignPlatformAdminSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid("Please provide a valid ID."),
    organizationId: zod_1.z.string().uuid("Please provide a valid ID."),
    note: zod_1.z.string().max(300, "Must not exceed 300 characters.").optional(),
});
exports.createPlatformUserSchema = zod_1.z.object({
    email: zod_1.z.string().email("Please enter a valid email address."),
    firstName: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    lastName: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    password: zod_1.z
        .string()
        .min(8, "Must be at least 8 characters long.")
        .max(128, "Must not exceed 128 characters."),
    globalRole: zod_1.z
        .enum(["PLATFORM_ADMIN", "SUPER_ADMIN"])
        .default("PLATFORM_ADMIN"),
});
// import { z } from "zod";
// import {
//   SubscriptionPlan,
//   SubscriptionStatus,
//   SponsorshipModel,
// } from "@prisma/client";
// export const listSchoolsQuerySchema = z.object({
//   search: z.string().max(100).optional(),
//   isActive: z
//     .enum(["true", "false"])
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   plan: z.nativeEnum(SubscriptionPlan).optional(),
//   limit: z.coerce.number().int().min(1).max(100).default(20),
//   cursor: z.string().uuid().optional(),
// });
// export const updateSchoolStatusSchema = z.object({
//   isActive: z.boolean(),
//   reason: z.string().max(500).optional(),
// });
// export const updateSubscriptionSchema = z.object({
//   plan: z.nativeEnum(SubscriptionPlan).optional(),
//   status: z.nativeEnum(SubscriptionStatus).optional(),
//   studentCap: z.number().int().min(1).max(100_000).optional(),
//   sponsorship: z.nativeEnum(SponsorshipModel).optional(),
//   currentPeriodEnd: z.string().datetime().optional().nullable(),
// });
// export const assignPlatformAdminSchema = z.object({
//   userId: z.string().uuid(),
//   organizationId: z.string().uuid(),
//   note: z.string().max(300).optional(),
// });
// export const createPlatformUserSchema = z.object({
//   email: z.string().email(),
//   firstName: z.string().min(1).max(80),
//   lastName: z.string().min(1).max(80),
//   password: z.string().min(8).max(128),
//   globalRole: z
//     .enum(["PLATFORM_ADMIN", "SUPER_ADMIN"])
//     .default("PLATFORM_ADMIN"),
// });
