import { z } from "zod";

export const dateRangeSchema = z.object({
  from: z

    .string()

    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")

    .optional(),

  to: z

    .string()

    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")

    .optional(),
});

export const exportQuerySchema = z.object({
  type: z.enum(["students", "attendance", "results", "invoices", "payments"]),

  classId: z.string().uuid("Please provide a valid ID.").optional(),

  termId: z.string().uuid("Please provide a valid ID.").optional(),

  from: z

    .string()

    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")

    .optional(),

  to: z

    .string()

    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")

    .optional(),

  format: z.enum(["json", "csv"]).default("json"),
});

export const auditLogQuerySchema = z.object({
  action: z.string().optional(),

  actorId: z.string().uuid("Please provide a valid ID.").optional(),

  from: z.string().datetime("Please provide a valid date and time.").optional(),

  to: z.string().datetime("Please provide a valid date and time.").optional(),

  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(100, "Must not exceed 100.")
    .default(50),

  cursor: z.string().uuid("Please provide a valid ID.").optional(),
});

// import { z } from "zod";

// export const dateRangeSchema = z.object({
//   from: z
//     .string()
//     .regex(/^\d{4}-\d{2}-\d{2}$/)
//     .optional(),
//   to: z
//     .string()
//     .regex(/^\d{4}-\d{2}-\d{2}$/)
//     .optional(),
// });

// export const exportQuerySchema = z.object({
//   type: z.enum(["students", "attendance", "results", "invoices", "payments"]),
//   classId: z.string().uuid().optional(),
//   termId: z.string().uuid().optional(),
//   from: z
//     .string()
//     .regex(/^\d{4}-\d{2}-\d{2}$/)
//     .optional(),
//   to: z
//     .string()
//     .regex(/^\d{4}-\d{2}-\d{2}$/)
//     .optional(),
//   format: z.enum(["json", "csv"]).default("json"),
// });

// export const auditLogQuerySchema = z.object({
//   action: z.string().optional(),
//   actorId: z.string().uuid().optional(),
//   from: z.string().datetime().optional(),
//   to: z.string().datetime().optional(),
//   limit: z.coerce.number().int().min(1).max(100).default(50),
//   cursor: z.string().uuid().optional(),
// });
