"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogQuerySchema = exports.exportQuerySchema = exports.dateRangeSchema = void 0;
const zod_1 = require("zod");
exports.dateRangeSchema = zod_1.z.object({
    from: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
        .optional(),
    to: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
        .optional(),
});
exports.exportQuerySchema = zod_1.z.object({
    type: zod_1.z.enum(["students", "attendance", "results", "invoices", "payments"]),
    classId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    termId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    from: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
        .optional(),
    to: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
        .optional(),
    format: zod_1.z.enum(["json", "csv"]).default("json"),
});
exports.auditLogQuerySchema = zod_1.z.object({
    action: zod_1.z.string().optional(),
    actorId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    from: zod_1.z.string().datetime("Please provide a valid date and time.").optional(),
    to: zod_1.z.string().datetime("Please provide a valid date and time.").optional(),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100, "Must not exceed 100.")
        .default(50),
    cursor: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
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
