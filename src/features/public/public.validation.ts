import { z } from "zod";

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug"),
});

export const publicDirectoryQuerySchema = z.object({
  search: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});
