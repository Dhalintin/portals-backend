import { z } from "zod";

export const createSubjectBodySchema = z.object({
  name: z.string().min(1).max(120).trim(),
  code: z
    .string()
    .max(30)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export const updateSubjectBodySchema = z
  .object({
    name: z.string().min(1).max(120).trim().optional(),
    code: z
      .string()
      .max(30)
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    isActive: z.boolean().optional(),
  })
  .strict();

export const listSubjectsQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(["true", "false", "all"]).optional().default("true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const subjectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateSubjectBody = z.infer<typeof createSubjectBodySchema>;
export type UpdateSubjectBody = z.infer<typeof updateSubjectBodySchema>;
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
