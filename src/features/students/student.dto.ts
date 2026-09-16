// src/features/students/student.dto.ts
import { z } from "zod";

const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);

export const createStudentBodySchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  otherNames: z
    .string()
    .max(100)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  /** Blank → server generates unique admission number for the school */
  admissionNumber: z
    .string()
    .max(50)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  gender: genderSchema.optional().nullable(),
  classId: z.string().uuid().optional().nullable(),
  parentPhone: z
    .string()
    .max(20)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  parentEmail: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim())
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export const updateStudentBodySchema = z
  .object({
    firstName: z.string().min(1).max(100).trim().optional(),
    lastName: z.string().min(1).max(100).trim().optional(),
    otherNames: z
      .string()
      .max(100)
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    admissionNumber: z.string().min(1).max(50).trim().optional(),
    gender: genderSchema.nullable().optional(),
    classId: z.string().uuid().nullable().optional(),
    parentPhone: z
      .string()
      .max(20)
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    parentEmail: z
      .string()
      .email()
      .transform((v) => v.toLowerCase().trim())
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    isActive: z.boolean().optional(),
  })
  .strict();

export const listStudentsQuerySchema = z.object({
  search: z.string().optional(),
  classId: z.string().uuid().optional(),
  gender: genderSchema.optional(),
  isActive: z.enum(["true", "false", "all"]).optional().default("true"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const studentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const bulkCreateStudentsBodySchema = z.object({
  students: z
    .array(createStudentBodySchema)
    .min(1, "At least one student required")
    .max(500, "Max 500 students per bulk import"),
});

export type CreateStudentBody = z.infer<typeof createStudentBodySchema>;
export type UpdateStudentBody = z.infer<typeof updateStudentBodySchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type BulkCreateStudentsBody = z.infer<
  typeof bulkCreateStudentsBodySchema
>;
