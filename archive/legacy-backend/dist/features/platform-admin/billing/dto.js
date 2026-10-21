"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationIdParamSchema = exports.recordPaymentSchema = exports.listBillingQuerySchema = void 0;
const zod_1 = require("zod");
exports.listBillingQuerySchema = zod_1.z.object({
    q: zod_1.z
        .string()
        .trim()
        .max(120)
        .optional()
        .transform((v) => (v && v.length ? v : undefined)),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
});
exports.recordPaymentSchema = zod_1.z.object({
    amountNgn: zod_1.z.coerce.number().int().positive("Amount must be positive"),
    note: zod_1.z.string().trim().max(500).optional().nullable(),
    paidAt: zod_1.z.coerce.date().optional(),
});
exports.organizationIdParamSchema = zod_1.z.object({
    organizationId: zod_1.z.string().min(1),
});
