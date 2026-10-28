"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteMemberSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.completeInvitationSchema = exports.googleInvitationSchema = exports.googleLoginSchema = exports.acceptExistingPasswordInvitationSchema = exports.acceptExistingInvitationSchema = exports.acceptInvitationSchema = exports.refreshSchema = exports.registerSchoolAdminSchema = exports.loginSchema = exports.passwordSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.passwordSchema = zod_1.z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Must not exceed 128 characters.")
    .regex(/[A-Za-z]/, "Password must include a letter")
    .regex(/[0-9]/, "Password must include a number")
    .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email("Please enter a valid email address.")
        .max(320, "Must not exceed 320 characters.")
        .transform((v) => v.trim().toLowerCase()),
    password: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(128, "Must not exceed 128 characters."),
    /** When logging into a school workspace */
    schoolSlug: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters.")
        .optional(),
});
exports.registerSchoolAdminSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email("Please enter a valid email address.")
        .max(320, "Must not exceed 320 characters.")
        .transform((v) => v.trim().toLowerCase()),
    password: exports.passwordSchema,
    firstName: zod_1.z
        .string()
        .trim()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    lastName: zod_1.z
        .string()
        .trim()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    phone: zod_1.z.string().trim().max(30, "Must not exceed 30 characters.").optional(),
    schoolName: zod_1.z
        .string()
        .trim()
        .min(2, "Must be at least 2 characters long.")
        .max(160, "Must not exceed 160 characters."),
    schoolSlug: zod_1.z
        .string()
        .trim()
        .min(2, "Must be at least 2 characters long.")
        .max(60, "Must not exceed 60 characters.")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, hyphens").optional(),
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(20, "Must be at least 20 characters long."),
});
exports.acceptInvitationSchema = zod_1.z.object({ token: zod_1.z.string().min(40).max(200), password: exports.passwordSchema,
    firstName: zod_1.z.string().trim().min(1).max(80).optional(), lastName: zod_1.z.string().trim().min(1).max(80).optional() }).strict();
exports.acceptExistingInvitationSchema = zod_1.z.object({ token: zod_1.z.string().min(40).max(200) }).strict();
exports.acceptExistingPasswordInvitationSchema = zod_1.z.object({ token: zod_1.z.string().min(40).max(200),
    currentPassword: zod_1.z.string().min(1).max(128) }).strict();
exports.googleLoginSchema = zod_1.z.object({ idToken: zod_1.z.string().min(20).max(10000), nonce: zod_1.z.string().min(16).max(200), schoolSlug: zod_1.z.string().max(80).optional() }).strict();
exports.googleInvitationSchema = exports.googleLoginSchema.omit({ schoolSlug: true }).extend({ token: zod_1.z.string().min(40).max(200) }).strict();
exports.completeInvitationSchema = zod_1.z.union([exports.acceptInvitationSchema, exports.acceptExistingPasswordInvitationSchema]);
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email("Please enter a valid email address.")
        .transform((v) => v.trim().toLowerCase()),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(20, "Must be at least 20 characters long."),
    password: exports.passwordSchema,
});
exports.inviteMemberSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .email("Please enter a valid email address.")
        .transform((v) => v.trim().toLowerCase()),
    firstName: zod_1.z
        .string()
        .trim()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    lastName: zod_1.z
        .string()
        .trim()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters."),
    role: zod_1.z.nativeEnum(client_1.OrgRole, { error: "Please select a valid role." }),
    phone: zod_1.z.string().trim().max(30, "Must not exceed 30 characters.").optional(),
});
// import { z } from "zod";
// import { OrgRole } from "@prisma/client";
// const passwordSchema = z
//   .string()
//   .min(8, "Password must be at least 8 characters")
//   .max(128)
//   .regex(/[A-Za-z]/, "Password must include a letter")
//   .regex(/[0-9]/, "Password must include a number");
// export const loginSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .max(320)
//     .transform((v) => v.trim().toLowerCase()),
//   password: z.string().min(1).max(128),
//   /** When logging into a school workspace */
//   schoolSlug: z.string().min(1).max(80).optional(),
// });
// export const registerSchoolAdminSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .max(320)
//     .transform((v) => v.trim().toLowerCase()),
//   password: passwordSchema,
//   firstName: z.string().trim().min(1).max(80),
//   lastName: z.string().trim().min(1).max(80),
//   phone: z.string().trim().max(30).optional(),
//   schoolName: z.string().trim().min(2).max(160),
//   schoolSlug: z
//     .string()
//     .trim()
//     .min(2)
//     .max(60)
//     .regex(
//       /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
//       "Slug must be lowercase letters, numbers, hyphens"
//     ),
// });
// export const refreshSchema = z.object({
//   refreshToken: z.string().min(20),
// });
// export const forgotPasswordSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .transform((v) => v.trim().toLowerCase()),
// });
// export const resetPasswordSchema = z.object({
//   token: z.string().min(20),
//   password: passwordSchema,
// });
// export const inviteMemberSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .transform((v) => v.trim().toLowerCase()),
//   firstName: z.string().trim().min(1).max(80),
//   lastName: z.string().trim().min(1).max(80),
//   role: z.nativeEnum(OrgRole),
//   phone: z.string().trim().max(30).optional(),
// });
// export type LoginInput = z.infer<typeof loginSchema>;
// export type RegisterSchoolAdminInput = z.infer<
//   typeof registerSchoolAdminSchema
// >;
