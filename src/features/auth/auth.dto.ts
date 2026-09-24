// src/features/auth/auth.dto.ts
import { z } from "zod";

/**
 * Client rules:
 * - Host WITHOUT school slug (localhost:3000, app.portals.com)
 *     → surface: "platform" (or omit org fields)
 * - Host WITH school slug (grace-international.localhost:3000)
 *     → surface: "school" + organizationSlug from host (required)
 */
export const loginBodySchema = z
  .object({
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(1, "Password is required"),
    surface: z.enum(["platform", "school"]),
    organizationId: z.string().uuid().optional(),
    organizationSlug: z
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
          code: z.ZodIssueCode.custom,
          message:
            "Platform sign-in must not include organizationId or organizationSlug",
          path: ["organizationSlug"],
        });
      }
      return;
    }

    // surface === "school"
    if (!val.organizationId && !val.organizationSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "School sign-in requires organizationSlug (from subdomain) or organizationId",
        path: ["organizationSlug"],
      });
    }
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

export const googleAuthBodySchema = z
  .object({
    idToken: z.string().min(1),
    surface: z.enum(["platform", "school"]),
    organizationId: z.string().uuid().optional(),
    organizationSlug: z
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
          code: z.ZodIssueCode.custom,
          message: "Platform sign-in must not include organization fields",
          path: ["organizationSlug"],
        });
      }
      return;
    }
    if (!val.organizationId && !val.organizationSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "School sign-in requires organizationSlug or organizationId",
        path: ["organizationSlug"],
      });
    }
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
