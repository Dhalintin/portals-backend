import { z } from "zod";

const uuid = z.string().uuid();

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sessionIdParamSchema = z.object({
  id: uuid,
});

export const termIdParamSchema = z.object({
  termId: uuid,
});

export const createSessionBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(4, "e.g. 2025/2026")
    .max(32)
    .regex(/^\d{4}\/\d{4}$/, "Use format YYYY/YYYY e.g. 2025/2026"),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  /** If true, marks this session current and clears others in the school */
  isCurrent: z.boolean().optional().default(false),
  /** Create FIRST / SECOND / THIRD terms automatically (default true) */
  createDefaultTerms: z.boolean().optional().default(true),
});

export const updateSessionBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^\d{4}\/\d{4}$/, "Use format YYYY/YYYY e.g. 2025/2026")
    .optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
});

export const updateTermBodySchema = z.object({
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
});

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionBodySchema>;
export type UpdateTermBody = z.infer<typeof updateTermBodySchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
