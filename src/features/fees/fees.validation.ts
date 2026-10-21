import { z } from "zod";

import {
  InvoiceStatus,
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
} from "@prisma/client";

export const createFeeCategorySchema = z.object({
  name: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(100, "Must not exceed 100 characters."),

  description: z
    .string()
    .max(500, "Must not exceed 500 characters.")
    .optional(),
});

export const updateFeeCategorySchema = createFeeCategorySchema

  .partial()

  .extend({
    isActive: z.boolean().optional(),
  });

export const createFeeStructureSchema = z.object({
  name: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(120, "Must not exceed 120 characters."),

  sessionId: z
    .string()
    .uuid("Please provide a valid ID.")
    .optional()
    .nullable(),

  termId: z.string().uuid("Please provide a valid ID.").optional().nullable(),

  classId: z.string().uuid("Please provide a valid ID.").optional().nullable(),

  items: z

    .array(
      z.object({
        feeCategoryId: z.string().uuid("Please provide a valid ID."),

        amountNgn: z
          .number()
          .int("Please enter a whole number.")
          .positive("Value must be greater than zero."),
      })
    )

    .min(1, "Must be at least 1."),
});

export const updateFeeStructureSchema = z.object({
  name: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(120, "Must not exceed 120 characters.")
    .optional(),

  isActive: z.boolean().optional(),

  items: z

    .array(
      z.object({
        feeCategoryId: z.string().uuid("Please provide a valid ID."),

        amountNgn: z
          .number()
          .int("Please enter a whole number.")
          .positive("Value must be greater than zero."),
      })
    )

    .min(1, "Must be at least 1.")

    .optional(),
}).strict().refine(input => Object.keys(input).length > 0, "Provide at least one field to update");

export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export const reversePaymentSchema = cancelInvoiceSchema;
export const correctInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  items: createFeeStructureSchema.shape.items.optional(),
  dueDate: z.string().datetime().nullable().optional(),
}).strict().refine(input => input.items !== undefined || input.dueDate !== undefined, "Provide items or dueDate");

export const generateInvoicesSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
  feeStructureId: z.string().uuid("Please provide a valid ID."),

  studentIds: z.array(z.string().uuid("Please provide a valid ID.")).min(1).optional(), // omitted selects active students; an empty array is rejected

  dueDate: z
    .string()
    .datetime("Please provide a valid date and time.")
    .optional()
    .nullable(),
});

export const listInvoicesQuerySchema = z.object({
  studentId: z.string().uuid("Please provide a valid ID.").optional(),

  termId: z.string().uuid("Please provide a valid ID.").optional(),

  status: z
    .nativeEnum(InvoiceStatus, {
      error: "Please select a valid invoice status.",
    })
    .optional(),

  outstandingOnly: z

    .enum(["true", "false"])

    .optional()

    .transform((v) => v === "true"),

  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(200, "Must not exceed 200.")
    .default(50),
});

export const createManualPaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
  amountNgn: z
    .number()
    .int("Please enter a whole number.")
    .positive("Value must be greater than zero.").max(2147483647),

  method: z.enum(["CASH", "BANK_TRANSFER", "POS", "OTHER"]).default("CASH"),

  source: z.literal("MANUAL").default("MANUAL"),

  note: z.string().max(500, "Must not exceed 500 characters.").optional(),

  paidAt: z
    .string()
    .datetime("Please provide a valid date and time.")
    .optional(),

  // Optional immediate allocation

  allocations: z

    .array(
      z.object({
        invoiceId: z.string().uuid("Please provide a valid ID."),

        amountNgn: z
          .number()
          .int("Please enter a whole number.")
          .positive("Value must be greater than zero."),
      })
    )

    .optional(),
});

export const allocatePaymentSchema = z.object({
  allocations: z

    .array(
      z.object({
        invoiceId: z.string().uuid("Please provide a valid ID."),

        amountNgn: z
          .number()
          .int("Please enter a whole number.")
          .positive("Value must be greater than zero."),
      })
    )

    .min(1, "Must be at least 1."),
});

export const initializePaymentSchema = z.object({
  amountNgn: z
    .number()
    .int("Please enter a whole number.")
    .positive("Value must be greater than zero."), // in Naira (we convert to kobo)

  email: z.string().email("Please enter a valid email address."), // payer email (parent or school)

  studentId: z.string().uuid("Please provide a valid ID.").optional(),

  invoiceIds: z.array(z.string().uuid("Please provide a valid ID.")).optional(), // auto-allocate on success

  callbackUrl: z.string().url("Please enter a valid URL.").optional(),

  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export type CreateManualPaymentInput = z.infer<
  typeof createManualPaymentSchema
>;
// import { z } from "zod";
// import {
//   InvoiceStatus,
//   PaymentMethod,
//   PaymentSource,
//   PaymentStatus,
// } from "@prisma/client";

// export const createFeeCategorySchema = z.object({
//   name: z.string().min(1).max(100),
//   description: z.string().max(500).optional(),
// });

// export const updateFeeCategorySchema = createFeeCategorySchema
//   .partial()
//   .extend({
//     isActive: z.boolean().optional(),
//   });

// export const createFeeStructureSchema = z.object({
//   name: z.string().min(1).max(120),
//   sessionId: z.string().uuid().optional().nullable(),
//   termId: z.string().uuid().optional().nullable(),
//   classId: z.string().uuid().optional().nullable(),
//   items: z
//     .array(
//       z.object({
//         feeCategoryId: z.string().uuid(),
//         amountNgn: z.number().int().positive(),
//       })
//     )
//     .min(1),
// });

// export const updateFeeStructureSchema = z.object({
//   name: z.string().min(1).max(120).optional(),
//   isActive: z.boolean().optional(),
//   items: z
//     .array(
//       z.object({
//         feeCategoryId: z.string().uuid(),
//         amountNgn: z.number().int().positive(),
//       })
//     )
//     .min(1)
//     .optional(),
// });

// export const generateInvoicesSchema = z.object({
//   feeStructureId: z.string().uuid(),
//   studentIds: z.array(z.string().uuid()).optional(), // if omitted → all active students in structure’s class (or whole school)
//   dueDate: z.string().datetime().optional().nullable(),
// });

// export const listInvoicesQuerySchema = z.object({
//   studentId: z.string().uuid().optional(),
//   termId: z.string().uuid().optional(),
//   status: z.nativeEnum(InvoiceStatus).optional(),
//   outstandingOnly: z
//     .enum(["true", "false"])
//     .optional()
//     .transform((v) => v === "true"),
//   limit: z.coerce.number().int().min(1).max(200).default(50),
// });

// export const createManualPaymentSchema = z.object({
//   amountNgn: z.number().int().positive(),
//   method: z.nativeEnum(PaymentMethod).default("CASH"),
//   source: z.literal("MANUAL").default("MANUAL"),
//   note: z.string().max(500).optional(),
//   paidAt: z.string().datetime().optional(),
//   // Optional immediate allocation
//   allocations: z
//     .array(
//       z.object({
//         invoiceId: z.string().uuid(),
//         amountNgn: z.number().int().positive(),
//       })
//     )
//     .optional(),
// });

// export const allocatePaymentSchema = z.object({
//   allocations: z
//     .array(
//       z.object({
//         invoiceId: z.string().uuid(),
//         amountNgn: z.number().int().positive(),
//       })
//     )
//     .min(1),
// });

// export const initializePaymentSchema = z.object({
//   amountNgn: z.number().int().positive(), // in Naira (we convert to kobo)
//   email: z.string().email(), // payer email (parent or school)
//   studentId: z.string().uuid().optional(),
//   invoiceIds: z.array(z.string().uuid()).optional(), // auto-allocate on success
//   callbackUrl: z.string().url().optional(),
//   metadata: z.record(z.string(), z.any()).optional(),
// });

// export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;
// export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;
// export type CreateManualPaymentInput = z.infer<
//   typeof createManualPaymentSchema
// >;
