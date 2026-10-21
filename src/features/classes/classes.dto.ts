// src/features/classes/class.dto.ts
import { z } from "zod";

export const createClassBodySchema = z.object({
  name: z.string().min(1).max(50).trim(), // "JSS 2", "SSS 1"
  arm: z
    .string()
    .max(50)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  level: z
    .string()
    .max(100)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export const updateClassBodySchema = z
  .object({
    name: z.string().min(1).max(50).trim().optional(),
    arm: z
      .string()
      .max(50)
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    level: z
      .string()
      .max(100)
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    isActive: z.boolean().optional(),
  })
  .strict();

export const listClassesQuerySchema = z.object({
  search: z.string().optional(),
  level: z.string().optional(),
  isActive: z.enum(["true", "false", "all"]).optional().default("true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const classIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateClassBody = z.infer<typeof createClassBodySchema>;
export type UpdateClassBody = z.infer<typeof updateClassBodySchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
