// src/features/schools/school.dto.ts
import { z } from "zod";

export const updateSchoolBodySchema = z
  .object({
    name: z.string().min(2).max(200).trim().optional(),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase().trim())
      .nullable()
      .optional(),
    phone: z.string().min(7).max(20).trim().nullable().optional(),
    logoUrl: z.string().url().max(500).nullable().optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Invalid hex color")
      .optional(),
    accentColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Invalid hex color")
      .optional(),
    address: z.string().max(500).trim().nullable().optional(),
    city: z.string().max(100).trim().nullable().optional(),
    state: z.string().max(100).trim().nullable().optional(),
    country: z.string().max(100).trim().optional(),
    motto: z.string().max(300).trim().nullable().optional(),
    schoolType: z.string().max(100).trim().nullable().optional(),
    // slug / isActive: not editable here (platform or dedicated flow later)
  })
  .strict();

export type UpdateSchoolBody = z.infer<typeof updateSchoolBodySchema>;
