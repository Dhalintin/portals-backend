import { z } from "zod";

export const listBillingQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ListBillingQuery = z.infer<typeof listBillingQuerySchema>;

export const recordPaymentSchema = z.object({
  amountNgn: z.coerce.number().int().positive("Amount must be positive"),
  note: z.string().trim().max(500).optional().nullable(),
  paidAt: z.coerce.date().optional(),
});

export type RecordPaymentBody = z.infer<typeof recordPaymentSchema>;

export const organizationIdParamSchema = z.object({
  organizationId: z.string().min(1),
});
