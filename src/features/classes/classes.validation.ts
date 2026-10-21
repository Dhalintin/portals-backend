import { z } from "zod";

export const listClassesQuerySchema = z.object({
  q: z.string().trim().max(80, "Must not exceed 80 characters.").optional(),

  isActive: z

    .enum(["true", "false"])

    .default("true")

    .optional()

    .transform((v) => (v === undefined ? undefined : v === "true")),

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
    .default(50),
});

export const createClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Must be at least 1 characters long.")
    .max(80, "Must not exceed 80 characters."),

  arm: z
    .string()
    .trim()
    .max(40, "Must not exceed 40 characters.")
    .nullable()
    .optional(),

  level: z
    .string()
    .trim()
    .max(40, "Must not exceed 40 characters.")
    .nullable()
    .optional(),

  isActive: z.boolean().default(true).optional(),

  classTeacherId: z
    .string()
    .uuid("Please provide a valid ID.")
    .nullable()
    .optional(),
});

export const updateClassSchema = createClassSchema.partial();

export const classIdParamsSchema = z.object({
  classId: z.string().uuid("Please provide a valid ID."),
});

export const assignClassTeacherSchema = z.object({
  classTeacherId: z.string().uuid("Please provide a valid ID.").nullable(),
});

export const addClassSubjectSchema = z.object({
  subjectIds: z.array(z.string().uuid("Please provide a valid ID.")),
});

export const classSubjectParamsSchema = z.object({
  classId: z.string().uuid("Please provide a valid ID."),

  subjectId: z.string().uuid("Please provide a valid ID."),
});

export const assignSubjectTeacherSchema = z.object({
  userId: z.string().uuid("Please provide a valid ID."),
});

// import { z } from "zod";

// export const listClassesQuerySchema = z.object({
//   q: z.string().trim().max(80).optional(),
//   isActive: z
//     .enum(["true", "false"])
//     .default("true")
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(50),
// });

// export const createClassSchema = z.object({
//   name: z.string().trim().min(1).max(80),
//   arm: z.string().trim().max(40).nullable().optional(),
//   level: z.string().trim().max(40).nullable().optional(),
//   isActive: z.boolean().default(true).optional(),
//   classTeacherId: z.string().uuid().nullable().optional(),
// });

// export const updateClassSchema = createClassSchema.partial();

// export const classIdParamsSchema = z.object({
//   classId: z.string().uuid(),
// });

// export const assignClassTeacherSchema = z.object({
//   classTeacherId: z.string().uuid().nullable(),
// });

// export const addClassSubjectSchema = z.object({
//   subjectIds: z.array(z.string().uuid()),
// });

// export const classSubjectParamsSchema = z.object({
//   classId: z.string().uuid(),
//   subjectId: z.string().uuid(),
// });

// export const assignSubjectTeacherSchema = z.object({
//   userId: z.string().uuid(),
// });
