import { z } from "zod";

/**
 * Public result verification (no auth).
 * Serial = Pin.id (printed on card). Code = Pin.code.
 * Organization is resolved by slug (subdomain / body).
 */
export const verifyResultSchema = z.object({
  organizationSlug: z
    .string()
    .min(1, "School is required")
    .max(120)
    .transform((s) => s.trim().toLowerCase()),
  admissionNumber: z
    .string()
    .min(1, "Admission number is required")
    .max(64)
    .transform((s) => s.trim()),
  /** Serial printed on card = Pin.id */
  serial: z
    .string()
    .min(1, "Serial number is required")
    .max(64)
    .transform((s) => s.trim()),
  /** PIN code printed on card = Pin.code */
  code: z
    .string()
    .min(1, "PIN is required")
    .max(64)
    .transform((s) => s.trim()),
});

export const listPublicSchoolsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type VerifyResultInput = z.infer<typeof verifyResultSchema>;
export type ListPublicSchoolsQuery = z.infer<
  typeof listPublicSchoolsQuerySchema
>;
