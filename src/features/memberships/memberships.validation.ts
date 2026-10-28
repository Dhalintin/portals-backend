import { z } from "zod";

import { OrgRole } from "@prisma/client";

export const listMembershipsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .default(1),

  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(100, "Must not exceed 100.")
    .default(20),
});

export const createMembershipSchema = z.object({
  email: z

    .string()

    .trim()
    .email("Please enter a valid email address.")

    .transform((v) => v.trim().toLowerCase()),

  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  role: z.nativeEnum(OrgRole).default("TEACHER"),

  phone: z.string().trim().max(30, "Must not exceed 30 characters.").optional(),

}).strict();

export const updateMembershipSchema = z.object({
  role: z
    .nativeEnum(OrgRole, { error: "Please select a valid role." })
    .optional(),

  isActive: z.boolean().optional(),
});

export const membershipIdParamsSchema = z.object({
  membershipId: z.string().uuid("Please provide a valid ID."),
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
