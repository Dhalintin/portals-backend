import { z } from "zod";

export const termIdQuerySchema = z.object({
  termId: z.string().uuid(),
});

export const classIdParamSchema = z.object({
  classId: z.string().uuid(),
});

export const entrySheetQuerySchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
});

export const bulkScoresBodySchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  scores: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        ca1: z.number().min(0).max(100).optional().nullable(),
        ca2: z.number().min(0).max(100).optional().nullable(),
        exam: z.number().min(0).max(100).optional().nullable(),
        remark: z.string().trim().max(300).optional().nullable(),
      })
    )
    .min(1)
    .max(200),
});

export type BulkScoresBody = z.infer<typeof bulkScoresBodySchema>;
export type EntrySheetQuery = z.infer<typeof entrySheetQuerySchema>;
