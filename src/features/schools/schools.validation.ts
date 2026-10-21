import { z } from "zod";

const hexColor = z

  .string()

  .regex(/^#([0-9A-Fa-f]{6})$/, "Use a hex color like #1e3a5f");

export const updateSchoolProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters long.")
    .max(160, "Must not exceed 160 characters.")
    .optional(),

  email: z

    .string()

    .email("Please enter a valid email address.")

    .max(320, "Must not exceed 320 characters.")

    .transform((v) => v.trim().toLowerCase())

    .nullable()

    .optional(),

  phone: z
    .string()
    .trim()
    .max(30, "Must not exceed 30 characters.")
    .nullable()
    .optional(),

  address: z
    .string()
    .trim()
    .max(500, "Must not exceed 500 characters.")
    .nullable()
    .optional(),

  city: z
    .string()
    .trim()
    .max(100, "Must not exceed 100 characters.")
    .nullable()
    .optional(),

  state: z
    .string()
    .trim()
    .max(100, "Must not exceed 100 characters.")
    .nullable()
    .optional(),

  country: z
    .string()
    .trim()
    .max(100, "Must not exceed 100 characters.")
    .optional(),

  motto: z
    .string()
    .trim()
    .max(240, "Must not exceed 240 characters.")
    .nullable()
    .optional(),

  schoolType: z
    .string()
    .trim()
    .max(80, "Must not exceed 80 characters.")
    .nullable()
    .optional(),
});

export const updateSchoolBrandingSchema = z.object({
  logoUrl: z
    .string()
    .url("Please enter a valid URL.")
    .max(2048, "URL is too long.")
    .nullable()
    .optional(),

  primaryColor: hexColor.optional(),

  accentColor: hexColor.optional(),
});

export const updateSchoolSlugSchema = z.object({
  slug: z

    .string()

    .trim()

    .min(2, "Must be at least 2 characters long.")

    .max(60, "Must not exceed 60 characters.")

    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

      "Slug must be lowercase letters, numbers, hyphens"
    ),
});

export type UpdateSchoolProfileInput = z.infer<
  typeof updateSchoolProfileSchema
>;

export type UpdateSchoolBrandingInput = z.infer<
  typeof updateSchoolBrandingSchema
>;

// import { z } from "zod";

// const hexColor = z
//   .string()
//   .regex(/^#([0-9A-Fa-f]{6})$/, "Use a hex color like #1e3a5f");

// export const updateSchoolProfileSchema = z.object({
//   name: z.string().trim().min(2).max(160).optional(),
//   email: z
//     .string()
//     .email()
//     .max(320)
//     .transform((v) => v.trim().toLowerCase())
//     .nullable()
//     .optional(),
//   phone: z.string().trim().max(30).nullable().optional(),
//   address: z.string().trim().max(500).nullable().optional(),
//   city: z.string().trim().max(100).nullable().optional(),
//   state: z.string().trim().max(100).nullable().optional(),
//   country: z.string().trim().max(100).optional(),
//   motto: z.string().trim().max(240).nullable().optional(),
//   schoolType: z.string().trim().max(80).nullable().optional(),
// });

// export const updateSchoolBrandingSchema = z.object({
//   logoUrl: z.string().url().max(2048).nullable().optional(),
//   primaryColor: hexColor.optional(),
//   accentColor: hexColor.optional(),
// });

// export const updateSchoolSlugSchema = z.object({
//   slug: z
//     .string()
//     .trim()
//     .min(2)
//     .max(60)
//     .regex(
//       /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
//       "Slug must be lowercase letters, numbers, hyphens"
//     ),
// });

// export type UpdateSchoolProfileInput = z.infer<
//   typeof updateSchoolProfileSchema
// >;
// export type UpdateSchoolBrandingInput = z.infer<
//   typeof updateSchoolBrandingSchema
// >;
