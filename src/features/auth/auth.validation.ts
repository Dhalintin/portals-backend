import { z } from "zod";

import { OrgRole } from "@prisma/client";

export const passwordSchema = z

  .string()

  .min(8, "Password must be at least 8 characters")

  .max(128, "Must not exceed 128 characters.")

  .regex(/[A-Za-z]/, "Password must include a letter")

  .regex(/[0-9]/, "Password must include a number")
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes");

export const loginSchema = z.object({
  email: z

    .string()

    .email("Please enter a valid email address.")

    .max(320, "Must not exceed 320 characters.")

    .transform((v) => v.trim().toLowerCase()),

  password: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(128, "Must not exceed 128 characters."),

  /** When logging into a school workspace */

  schoolSlug: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters.")
    .optional(),
});

export const registerSchoolAdminSchema = z.object({
  email: z

    .string()

    .email("Please enter a valid email address.")

    .max(320, "Must not exceed 320 characters.")

    .transform((v) => v.trim().toLowerCase()),

  password: passwordSchema,

  firstName: z
    .string()
    .trim()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),

  lastName: z
    .string()
    .trim()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),

  phone: z.string().trim().max(30, "Must not exceed 30 characters.").optional(),

  schoolName: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters long.")
    .max(160, "Must not exceed 160 characters."),

  schoolSlug: z

    .string()

    .trim()

    .min(2, "Must be at least 2 characters long.")

    .max(60, "Must not exceed 60 characters.")

    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

      "Slug must be lowercase letters, numbers, hyphens"
    ),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, "Must be at least 20 characters long."),
});
export const acceptInvitationSchema = z.object({ token: z.string().min(40).max(200), password: passwordSchema }).strict();
export const acceptExistingInvitationSchema = z.object({ token: z.string().min(40).max(200) }).strict();
export const acceptExistingPasswordInvitationSchema = z.object({ token: z.string().min(40).max(200),
  currentPassword: z.string().min(1).max(128) }).strict();

export const forgotPasswordSchema = z.object({
  email: z

    .string()

    .email("Please enter a valid email address.")

    .transform((v) => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "Must be at least 20 characters long."),

  password: passwordSchema,
});

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address.")
    .transform((v) => v.trim().toLowerCase()),
  firstName: z
    .string()
    .trim()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),
  lastName: z
    .string()
    .trim()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),
  role: z.nativeEnum(OrgRole, { error: "Please select a valid role." }),
  phone: z.string().trim().max(30, "Must not exceed 30 characters.").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type RegisterSchoolAdminInput = z.infer<
  typeof registerSchoolAdminSchema
>;

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
