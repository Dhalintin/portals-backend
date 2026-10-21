// src/features/classes/classSubject.dto.ts
import { z } from "zod";

export const classIdForClassSubjectParamsSchema = z.object({
  classId: z.string().uuid(),
});

export const setClassSubjectsBodySchema = z.object({
  subjectIds: z.array(z.string().uuid()).max(100),
});

export const addClassSubjectBodySchema = z.object({
  subjectId: z.string().uuid(),
});

export const classSubjectParamsSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
});

export type SetClassSubjectsBody = z.infer<typeof setClassSubjectsBodySchema>;
export type AddClassSubjectBody = z.infer<typeof addClassSubjectBodySchema>;
