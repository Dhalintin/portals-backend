import { z } from "zod";
import { GlobalRole, PinStatus } from "@prisma/client";

export const listSchoolsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  isActive: z.enum(["true", "false", "all"]).default("all"),
});

export const orgIdParamSchema = z.object({
  organizationId: z.string().uuid(),
});

export const createPlatformAdminBodySchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().nullable(),
  temporaryPassword: z.string().min(8).max(72).optional(),
});

export const assignSchoolsBodySchema = z.object({
  userId: z.string().uuid(),
  organizationIds: z.array(z.string().uuid()).min(1).max(50),
  note: z.string().trim().max(300).optional().nullable(),
});

export const unassignSchoolBodySchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export const generatePinsForSchoolBodySchema = z.object({
  termId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(500),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const listPinsForSchoolQuerySchema = z.object({
  termId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.nativeEnum(PinStatus).optional(),
  /** Platform print: return full codes (default true for platform admin) */
  includeCodes: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // e.g. in listPinsQuerySchema
  isPrinted: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
});

export const listPlatformAdminsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
});

export const markPinsPrintedSchema = z.object({
  pinIds: z
    .array(z.string().min(1))
    .min(1, "At least one pin id is required")
    .max(500, "Cannot mark more than 500 pins at once"),
});

export const markPinsPrintedParamsSchema = z.object({
  organizationId: z.string().min(1),
});

export type ListSchoolsQuery = z.infer<typeof listSchoolsQuerySchema>;
export type CreatePlatformAdminBody = z.infer<
  typeof createPlatformAdminBodySchema
>;
export type AssignSchoolsBody = z.infer<typeof assignSchoolsBodySchema>;
export type GeneratePinsForSchoolBody = z.infer<
  typeof generatePinsForSchoolBodySchema
>;
export type MarkPinsPrintedBody = z.infer<typeof markPinsPrintedSchema>;
