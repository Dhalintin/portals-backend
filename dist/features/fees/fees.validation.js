"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializePaymentSchema = exports.allocatePaymentSchema = exports.createManualPaymentSchema = exports.listInvoicesQuerySchema = exports.generateInvoicesSchema = exports.correctInvoiceSchema = exports.reversePaymentSchema = exports.cancelInvoiceSchema = exports.updateFeeStructureSchema = exports.createFeeStructureSchema = exports.updateFeeCategorySchema = exports.createFeeCategorySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.createFeeCategorySchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(100, "Must not exceed 100 characters."),
    description: zod_1.z
        .string()
        .max(500, "Must not exceed 500 characters.")
        .optional(),
});
exports.updateFeeCategorySchema = exports.createFeeCategorySchema
    .partial()
    .extend({
    isActive: zod_1.z.boolean().optional(),
});
exports.createFeeStructureSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(120, "Must not exceed 120 characters."),
    sessionId: zod_1.z
        .string()
        .uuid("Please provide a valid ID.")
        .optional()
        .nullable(),
    termId: zod_1.z.string().uuid("Please provide a valid ID.").optional().nullable(),
    classId: zod_1.z.string().uuid("Please provide a valid ID.").optional().nullable(),
    items: zod_1.z
        .array(zod_1.z.object({
        feeCategoryId: zod_1.z.string().uuid("Please provide a valid ID."),
        amountNgn: zod_1.z
            .number()
            .int("Please enter a whole number.")
            .positive("Value must be greater than zero."),
    }))
        .min(1, "Must be at least 1."),
});
exports.updateFeeStructureSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(120, "Must not exceed 120 characters.")
        .optional(),
    isActive: zod_1.z.boolean().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        feeCategoryId: zod_1.z.string().uuid("Please provide a valid ID."),
        amountNgn: zod_1.z
            .number()
            .int("Please enter a whole number.")
            .positive("Value must be greater than zero."),
    }))
        .min(1, "Must be at least 1.")
        .optional(),
}).strict().refine(input => Object.keys(input).length > 0, "Provide at least one field to update");
exports.cancelInvoiceSchema = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) }).strict();
exports.reversePaymentSchema = exports.cancelInvoiceSchema;
exports.correctInvoiceSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(3).max(500),
    items: exports.createFeeStructureSchema.shape.items.optional(),
    dueDate: zod_1.z.string().datetime().nullable().optional(),
}).strict().refine(input => input.items !== undefined || input.dueDate !== undefined, "Provide items or dueDate");
exports.generateInvoicesSchema = zod_1.z.object({
    classIds: zod_1.z.array(zod_1.z.string().uuid("Please provide a valid class ID.")).min(1).max(200).optional(),
    idempotencyKey: zod_1.z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
    feeStructureId: zod_1.z.string().uuid("Please provide a valid ID."),
    studentIds: zod_1.z.array(zod_1.z.string().uuid("Please provide a valid ID.")).min(1).optional(), // omitted selects active students; an empty array is rejected
    dueDate: zod_1.z
        .string()
        .datetime("Please provide a valid date and time.")
        .optional()
        .nullable(),
});
exports.listInvoicesQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(100).optional(),
    paymentState: zod_1.z.enum(['owing', 'unpaid', 'partial', 'paid', 'all']).optional(),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    studentId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    termId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    status: zod_1.z
        .nativeEnum(client_1.InvoiceStatus, {
        error: "Please select a valid invoice status.",
    })
        .optional(),
    outstandingOnly: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(200, "Must not exceed 200.")
        .default(50),
});
exports.createManualPaymentSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid().optional(),
    idempotencyKey: zod_1.z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
    amountNgn: zod_1.z
        .number()
        .int("Please enter a whole number.")
        .positive("Value must be greater than zero.").max(2147483647),
    method: zod_1.z.enum(["CASH", "BANK_TRANSFER", "POS", "OTHER"]).default("CASH"),
    source: zod_1.z.literal("MANUAL").default("MANUAL"),
    note: zod_1.z.string().max(500, "Must not exceed 500 characters.").optional(),
    paidAt: zod_1.z
        .string()
        .datetime("Please provide a valid date and time.")
        .optional(),
    // Optional immediate allocation
    allocations: zod_1.z
        .array(zod_1.z.object({
        invoiceId: zod_1.z.string().uuid("Please provide a valid ID."),
        amountNgn: zod_1.z
            .number()
            .int("Please enter a whole number.")
            .positive("Value must be greater than zero."),
    }))
        .optional(),
});
exports.allocatePaymentSchema = zod_1.z.object({
    allocations: zod_1.z
        .array(zod_1.z.object({
        invoiceId: zod_1.z.string().uuid("Please provide a valid ID."),
        amountNgn: zod_1.z
            .number()
            .int("Please enter a whole number.")
            .positive("Value must be greater than zero."),
    }))
        .min(1, "Must be at least 1."),
});
exports.initializePaymentSchema = zod_1.z.object({
    amountNgn: zod_1.z
        .number()
        .int("Please enter a whole number.")
        .positive("Value must be greater than zero."), // in Naira (we convert to kobo)
    email: zod_1.z.string().email("Please enter a valid email address."), // payer email (parent or school)
    studentId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    invoiceIds: zod_1.z.array(zod_1.z.string().uuid("Please provide a valid ID.")).optional(), // auto-allocate on success
    callbackUrl: zod_1.z.string().url("Please enter a valid URL.").optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
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
