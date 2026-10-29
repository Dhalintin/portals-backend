"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.membershipIdParamsSchema = exports.updateMembershipSchema = exports.createMembershipSchema = exports.listMembershipsQuerySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.listMembershipsQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .default(1),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100, "Must not exceed 100.")
        .default(20),
});
exports.createMembershipSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .trim()
        .email("Please enter a valid email address.")
        .transform((v) => v.trim().toLowerCase()),
    firstName: zod_1.z.string().trim().max(80).default(""),
    lastName: zod_1.z.string().trim().max(80).default(""),
    role: zod_1.z.nativeEnum(client_1.OrgRole).default("TEACHER"),
    phone: zod_1.z.string().trim().max(30, "Must not exceed 30 characters.").optional(),
}).strict();
exports.updateMembershipSchema = zod_1.z.object({
    role: zod_1.z.nativeEnum(client_1.OrgRole).optional(),
    roles: zod_1.z.array(zod_1.z.nativeEnum(client_1.OrgRole)).min(1).max(8).refine(roles => new Set(roles).size === roles.length, "Select each role once").refine(roles => !roles.includes('PARENT') || roles.length === 1, "Parent access uses its own portal; assign staff roles separately").optional(),
    isActive: zod_1.z.boolean().optional(),
}).strict().refine(input => !(input.role && input.roles), "Send role or roles, not both").refine(input => Object.keys(input).length > 0, "Choose something to update");
exports.membershipIdParamsSchema = zod_1.z.object({
    membershipId: zod_1.z.string().uuid("Please provide a valid ID."),
});
// import { z } from "zod";
// import { OrgRole } from "@prisma/client";
// export const listMembershipsQuerySchema = z.object({
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(20),
// });
// export const createMembershipSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .transform((v) => v.trim().toLowerCase()),
//   firstName: z.string().trim().min(1).max(80),
//   lastName: z.string().trim().min(1).max(80),
//   role: z.nativeEnum(OrgRole),
//   phone: z.string().trim().max(30).optional(),
//   /** Temporary password if creating a new user */
//   password: z.string().min(8).max(128).optional(),
// });
// export const updateMembershipSchema = z.object({
//   role: z.nativeEnum(OrgRole).optional(),
//   isActive: z.boolean().optional(),
// });
// export const membershipIdParamsSchema = z.object({
//   membershipId: z.string().uuid(),
// });
