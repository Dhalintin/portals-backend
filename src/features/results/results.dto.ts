import { z } from "zod";

const uuid = z.string().uuid();

const scoreValue = z
  .number()
  .min(0, "Score cannot be negative")
  .max(100, "Score cannot exceed 100")
  .nullable()
  .optional();

export const listResultsQuerySchema = z.object({
  termId: uuid.optional(),
  classId: uuid.optional(),
  studentId: uuid.optional(),
  isPublished: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const resultIdParamSchema = z.object({
  id: uuid,
});

export const studentTermParamsSchema = z.object({
  studentId: uuid,
  termId: uuid,
});

export const classTermSubjectQuerySchema = z.object({
  classId: uuid,
  termId: uuid,
  subjectId: uuid,
});

export const upsertScoreItemSchema = z.object({
  subjectId: uuid,
  ca1: scoreValue,
  ca2: scoreValue,
  exam: scoreValue,
  remark: z.string().trim().max(500).nullable().optional(),
});

export const upsertScoresBodySchema = z.object({
  scores: z.array(upsertScoreItemSchema).min(1),
  /** Optional principal/form-teacher remark on the Result */
  remark: z.string().trim().max(1000).nullable().optional(),
});

/** Teacher bulk entry: one subject across a class for a term */
export const bulkScoresBodySchema = z.object({
  classId: uuid,
  termId: uuid,
  subjectId: uuid,
  scores: z
    .array(
      z.object({
        studentId: uuid,
        ca1: scoreValue,
        ca2: scoreValue,
        exam: scoreValue,
        remark: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1),
});

export const updateResultBodySchema = z.object({
  remark: z.string().trim().max(1000).nullable().optional(),
  grade: z.string().trim().max(10).nullable().optional(),
});

export const publishResultsBodySchema = z.object({
  termId: uuid,
  /** If omitted, all classes in the term for this school */
  classId: uuid.optional(),
  isPublished: z.boolean(),
});

export const recalculatePositionsBodySchema = z.object({
  termId: uuid,
  classId: uuid,
});

export const resultsStatsQuerySchema = z.object({
  termId: uuid,
  classId: uuid.optional(),
});

/** Public parent check — no JWT */
export const verifyResultBodySchema = z.object({
  schoolSlug: z.string().trim().min(1).max(100),
  admissionNumber: z.string().trim().min(1).max(50),
  pin: z.string().trim().min(4).max(64),
});

export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>;
export type UpsertScoresBody = z.infer<typeof upsertScoresBodySchema>;
export type BulkScoresBody = z.infer<typeof bulkScoresBodySchema>;
export type UpdateResultBody = z.infer<typeof updateResultBodySchema>;
export type PublishResultsBody = z.infer<typeof publishResultsBodySchema>;
export type RecalculatePositionsBody = z.infer<
  typeof recalculatePositionsBodySchema
>;
export type ResultsStatsQuery = z.infer<typeof resultsStatsQuerySchema>;
export type VerifyResultBody = z.infer<typeof verifyResultBodySchema>;
