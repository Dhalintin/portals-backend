import { z } from 'zod';
import { AppError } from '../../lib/errors';

export const examEntrySchema = z.object({
  id: z.string().uuid(), classId: z.string().uuid(), subjectId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Choose a valid exam date'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  venue: z.string().trim().max(100).default(''), note: z.string().trim().max(300).default(''),
}).strict().refine(entry => entry.endTime > entry.startTime, 'End time must be after start time');
export const saveTimetableSchema = z.object({
  termId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(120), entries: z.array(examEntrySchema).max(500),
}).strict().refine(input => new Set(input.entries.map(entry => entry.id)).size === input.entries.length, 'Each exam row needs a unique ID');
export const timetableVersionSchema = z.object({ termId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();
export const publishedQuerySchema = z.object({ termId: z.string().uuid().optional(), studentId: z.string().uuid().optional() });
export type ExamEntry = z.infer<typeof examEntrySchema>;
export function examEntriesSignature(entries: ExamEntry[]) {
  return JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)).map(entry => [entry.id, entry.classId, entry.subjectId, entry.date, entry.startTime, entry.endTime, entry.venue, entry.note]));
}


export function validateExamClashes(entries: ExamEntry[]) {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    for (const other of entries.slice(index + 1)) {
      if (entry.date !== other.date || entry.startTime >= other.endTime || other.startTime >= entry.endTime) continue;
      if (entry.classId === other.classId) throw new AppError(409, 'CLASS_EXAM_CLASH', 'This class has overlapping exams on ' + entry.date + '. Check the start and end times.');
      const sameVenue = entry.venue && entry.venue.trim().toLowerCase() === other.venue.trim().toLowerCase();
      const sharedPaper = entry.subjectId === other.subjectId && entry.startTime === other.startTime && entry.endTime === other.endTime;
      if (sameVenue && !sharedPaper) throw new AppError(409, 'VENUE_EXAM_CLASH', entry.venue + ' is already used for a different exam during this time.');
    }
  }
}
