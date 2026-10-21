import { z } from "zod";

import {
  SubscriptionPlan,
  SubscriptionStatus,
  SponsorshipModel,
} from "@prisma/client";

export const listSchoolsQuerySchema = z.object({
  search: z.string().max(100, "Must not exceed 100 characters.").optional(),

  isActive: z

    .enum(["true", "false"])

    .optional()

    .transform((v) => (v === undefined ? undefined : v === "true")),

  plan: z
    .nativeEnum(SubscriptionPlan, {
      error: "Please select a valid subscription plan.",
    })
    .optional(),

  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(100, "Must not exceed 100.")
    .default(20),

  cursor: z.string().uuid("Please provide a valid ID.").optional(),
});

export const updateSchoolStatusSchema = z.object({
  isActive: z.boolean(),

  reason: z.string().max(500, "Must not exceed 500 characters.").optional(),
});

export const updateSubscriptionSchema = z.object({
  plan: z
    .nativeEnum(SubscriptionPlan, {
      error: "Please select a valid subscription plan.",
    })
    .optional(),

  status: z
    .nativeEnum(SubscriptionStatus, {
      error: "Please select a valid subscription status.",
    })
    .optional(),

  studentCap: z
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(100_000, "Must not exceed 100_000.")
    .optional(),

  sponsorship: z
    .nativeEnum(SponsorshipModel, {
      error: "Please select a valid sponsorship model.",
    })
    .optional(),

  currentPeriodEnd: z
    .string()
    .datetime("Please provide a valid date and time.")
    .optional()
    .nullable(),
});

export const assignPlatformAdminSchema = z.object({
  userId: z.string().uuid("Please provide a valid ID."),

  organizationId: z.string().uuid("Please provide a valid ID."),

  note: z.string().max(300, "Must not exceed 300 characters.").optional(),
});

export const createPlatformUserSchema = z.object({
  email: z.string().email("Please enter a valid email address."),

  firstName: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),

  lastName: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),

  password: z
    .string()
    .min(8, "Must be at least 8 characters long.")
    .max(128, "Must not exceed 128 characters."),

  globalRole: z
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
