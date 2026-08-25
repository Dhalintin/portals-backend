// src/features/auth/auth.dto.ts
import { z } from "zod";

export const loginBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
  /** Required when the user belongs to more than one active school */
  surface: z.enum(["platform", "school"]).optional().default("school"),
  organizationId: z.string().uuid().optional(),
  organizationSlug: z.string().min(1).max(80).optional(),
  // organizationId: z.string().uuid().optional(),
});

export const registerBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z
    .string()
    .min(7)
    .max(20)
    .optional()
    .transform((v) => (v ? v.trim() : undefined)),
  organizationName: z.string().min(2).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

export const createOrganizationBodySchema = z.object({
  organizationName: z.string().min(2).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  phone: z.string().min(7).max(20).optional(),
  email: z.string().email().optional(),
});

export const forgotPasswordBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const switchOrganizationBodySchema = z.object({
  organizationId: z.string().uuid(),
});

export const googleAuthBodySchema = z.object({
  idToken: z.string().min(1),
  /** Same as login: required when user has multiple active memberships */
  organizationId: z.string().uuid().optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type CreateOrganizationBody = z.infer<
  typeof createOrganizationBodySchema
>;
export type SwitchOrganizationBody = z.infer<
  typeof switchOrganizationBodySchema
>;
export type GoogleAuthBody = z.infer<typeof googleAuthBodySchema>;
