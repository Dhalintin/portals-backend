import { z } from "zod";

export const listParentsQuerySchema = z.object({
  q: z.string().trim().max(120, "Must not exceed 120 characters.").optional(),

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

export const createParentSchema = z.object({
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

  phone: z
    .string()
    .trim()
    .max(30, "Must not exceed 30 characters.")
    .nullable()
    .optional(),

  email: z

    .string()

    .email("Please enter a valid email address.")

    .max(320, "Must not exceed 320 characters.")

    .transform((v) => v.trim().toLowerCase())

    .nullable()

    .optional(),
});

export const updateParentSchema = createParentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const parentIdParamsSchema = z.object({
  parentId: z.string().uuid("Please provide a valid ID."),
});

export const linkStudentSchema = z.object({
  studentId: z.string().uuid("Please provide a valid ID."),

  relation: z
    .string()
    .trim()
    .max(40, "Must not exceed 40 characters.")
    .nullable()
    .optional(),

  isPrimary: z.boolean().optional(),
});

export const linkStudentParamsSchema = z.object({
  parentId: z.string().uuid("Please provide a valid ID."),

  studentId: z.string().uuid("Please provide a valid ID."),
});

export const inviteParentUserSchema = z.object({
  email: z

    .string()

    .email("Please enter a valid email address.")

    .transform((v) => v.trim().toLowerCase()),

}).strict();

// import { z } from "zod";

// export const listParentsQuerySchema = z.object({
//   q: z.string().trim().max(120).optional(),
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(20),
// });

// export const createParentSchema = z.object({
//   firstName: z.string().trim().min(1).max(80),
//   lastName: z.string().trim().min(1).max(80),
//   phone: z.string().trim().max(30).nullable().optional(),
//   email: z
//     .string()
//     .email()
//     .max(320)
//     .transform((v) => v.trim().toLowerCase())
//     .nullable()
//     .optional(),
// });

// export const updateParentSchema = createParentSchema.partial().extend({
//   isActive: z.boolean().optional(),
// });

// export const parentIdParamsSchema = z.object({
//   parentId: z.string().uuid(),
// });

// export const linkStudentSchema = z.object({
//   studentId: z.string().uuid(),
//   relation: z.string().trim().max(40).nullable().optional(),
//   isPrimary: z.boolean().optional(),
// });

// export const linkStudentParamsSchema = z.object({
//   parentId: z.string().uuid(),
//   studentId: z.string().uuid(),
// });

// export const inviteParentUserSchema = z.object({
//   email: z
//     .string()
//     .email()
//     .transform((v) => v.trim().toLowerCase()),
//   password: z.string().min(8).max(128),
// });
