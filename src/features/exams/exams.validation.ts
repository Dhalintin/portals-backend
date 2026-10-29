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
export const assessmentKindSchema=z.enum(['EXAM','TEST']).default('EXAM');
export const timetableFormatSchema=z.object({
 startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'Choose a valid start date'),
 startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
 papersPerDay:z.number().int().min(1).max(6),paperMinutes:z.number().int().min(15).max(240),
 breakAfter:z.number().int().min(1).max(6),breakMinutes:z.number().int().min(0).max(120),
 weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days=>new Set(days).size===days.length,'Choose each weekday once').transform(days=>days.sort((a,b)=>a-b)),
}).strict().superRefine((format,ctx)=>{const start=Number(format.startTime.slice(0,2))*60+Number(format.startTime.slice(3));const finish=start+format.papersPerDay*format.paperMinutes+Math.floor((format.papersPerDay-1)/format.breakAfter)*format.breakMinutes;if(finish>=1440)ctx.addIssue({code:'custom',message:'The daily papers and breaks must finish before midnight'});});
export type TimetableFormat=z.infer<typeof timetableFormatSchema>;
export function formatSignature(format:TimetableFormat|null|undefined){return JSON.stringify(format?[format.startDate,format.startTime,format.papersPerDay,format.paperMinutes,format.breakAfter,format.breakMinutes,[...format.weekdays].sort()]:null);}
export function validateFormattedEntries(entries:ExamEntry[],format:TimetableFormat){
 const time=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 let cursor=Number(format.startTime.slice(0,2))*60+Number(format.startTime.slice(3));const slots:string[]=[];
 for(let paper=1;paper<=format.papersPerDay;paper++){slots.push(time(cursor)+'-'+time(cursor+format.paperMinutes));cursor+=format.paperMinutes;if(paper<format.papersPerDay&&paper%format.breakAfter===0)cursor+=format.breakMinutes;}
 const subjects=new Set<string>();
 for(const entry of entries){if(entry.date<format.startDate||!format.weekdays.includes(new Date(entry.date+'T00:00:00Z').getUTCDay())||!slots.includes(entry.startTime+'-'+entry.endTime))throw new AppError(400,'TIMETABLE_FORMAT_MISMATCH','Each paper must use an allowed day and paper slot. Breaks are reserved.');const key=entry.classId+':'+entry.subjectId;if(subjects.has(key))throw new AppError(400,'DUPLICATE_CLASS_PAPER','A subject can appear only once per class in this timetable.');subjects.add(key);}
}
export const saveTimetableSchema = z.object({
  termId: z.string().uuid(), kind:assessmentKindSchema, format:timetableFormatSchema.nullable().optional(), expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(120), entries: z.array(examEntrySchema).max(500),
}).strict().refine(input => new Set(input.entries.map(entry => entry.id)).size === input.entries.length, 'Each exam row needs a unique ID');
export const timetableVersionSchema = z.object({ termId: z.string().uuid(), kind:assessmentKindSchema, expectedVersion: z.number().int().positive() }).strict();
export const publishedQuerySchema = z.object({ kind:assessmentKindSchema, termId: z.string().uuid().optional(), studentId: z.string().uuid().optional() });
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
