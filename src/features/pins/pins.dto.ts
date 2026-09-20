import { z } from "zod";
import { PinStatus } from "@prisma/client";

const uuid = z.string().uuid();

export const listPinsQuerySchema = z.object({
  termId: uuid.optional(),
  status: z.nativeEnum(PinStatus).optional(),
  search: z.string().trim().max(64).optional(), // serial (id) prefix or masked lookup
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pinIdParamSchema = z.object({
  id: uuid,
});

export const generatePinsBodySchema = z.object({
  termId: uuid,
  quantity: z.coerce
    .number()
    .int()
    .min(1, "Generate at least 1 PIN")
    .max(500, "Max 500 PINs per batch"),
  /** Optional absolute expiry */
  expiresAt: z.coerce.date().optional().nullable(),
  /** Optional: same student on every card in this batch (rare) */
  studentId: uuid.optional().nullable(),
});

export const updatePinBodySchema = z.object({
  status: z.enum([PinStatus.DISABLED, PinStatus.UNUSED]).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  studentId: uuid.optional().nullable(),
});

export const pinsStatsQuerySchema = z.object({
  termId: uuid.optional(),
});

/** Public parent check — serial = Pin.id */
export const verifyPinBodySchema = z.object({
  schoolSlug: z.string().trim().min(1).max(100),
  admissionNumber: z.string().trim().min(1).max(50),
  serial: uuid, // Pin.id
  pin: z.string().trim().min(6).max(32),
});

export type ListPinsQuery = z.infer<typeof listPinsQuerySchema>;
export type GeneratePinsBody = z.infer<typeof generatePinsBodySchema>;
export type UpdatePinBody = z.infer<typeof updatePinBodySchema>;
export type PinsStatsQuery = z.infer<typeof pinsStatsQuerySchema>;
export type VerifyPinBody = z.infer<typeof verifyPinBodySchema>;
