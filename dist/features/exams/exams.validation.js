"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishedQuerySchema = exports.timetableVersionSchema = exports.saveTimetableSchema = exports.timetableFormatSchema = exports.assessmentKindSchema = exports.examEntrySchema = void 0;
exports.formatSignature = formatSignature;
exports.validateFormattedEntries = validateFormattedEntries;
exports.examEntriesSignature = examEntriesSignature;
exports.validateExamClashes = validateExamClashes;
const zod_1 = require("zod");
const errors_1 = require("../../lib/errors");
exports.examEntrySchema = zod_1.z.object({
    id: zod_1.z.string().uuid(), classId: zod_1.z.string().uuid(), subjectId: zod_1.z.string().uuid(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
        const date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'Choose a valid exam date'),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    venue: zod_1.z.string().trim().max(100).default(''), note: zod_1.z.string().trim().max(300).default(''),
}).strict().refine(entry => entry.endTime > entry.startTime, 'End time must be after start time');
exports.assessmentKindSchema = zod_1.z.enum(['EXAM', 'TEST']).default('EXAM');
exports.timetableFormatSchema = zod_1.z.object({
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, 'Choose a valid start date'),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    papersPerDay: zod_1.z.number().int().min(1).max(6), paperMinutes: zod_1.z.number().int().min(15).max(240),
    breakAfter: zod_1.z.number().int().min(1).max(6), breakMinutes: zod_1.z.number().int().min(0).max(120),
    weekdays: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, 'Choose each weekday once').transform(days => days.sort((a, b) => a - b)),
}).strict().superRefine((format, ctx) => { const start = Number(format.startTime.slice(0, 2)) * 60 + Number(format.startTime.slice(3)); const finish = start + format.papersPerDay * format.paperMinutes + Math.floor((format.papersPerDay - 1) / format.breakAfter) * format.breakMinutes; if (finish >= 1440)
    ctx.addIssue({ code: 'custom', message: 'The daily papers and breaks must finish before midnight' }); });
function formatSignature(format) { return JSON.stringify(format ? [format.startDate, format.startTime, format.papersPerDay, format.paperMinutes, format.breakAfter, format.breakMinutes, [...format.weekdays].sort()] : null); }
function validateFormattedEntries(entries, format) {
    const time = (minutes) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    let cursor = Number(format.startTime.slice(0, 2)) * 60 + Number(format.startTime.slice(3));
    const slots = [];
    for (let paper = 1; paper <= format.papersPerDay; paper++) {
        slots.push(time(cursor) + '-' + time(cursor + format.paperMinutes));
        cursor += format.paperMinutes;
        if (paper < format.papersPerDay && paper % format.breakAfter === 0)
            cursor += format.breakMinutes;
    }
    const subjects = new Set();
    for (const entry of entries) {
        if (entry.date < format.startDate || !format.weekdays.includes(new Date(entry.date + 'T00:00:00Z').getUTCDay()) || !slots.includes(entry.startTime + '-' + entry.endTime))
            throw new errors_1.AppError(400, 'TIMETABLE_FORMAT_MISMATCH', 'Each paper must use an allowed day and paper slot. Breaks are reserved.');
        const key = entry.classId + ':' + entry.subjectId;
        if (subjects.has(key))
            throw new errors_1.AppError(400, 'DUPLICATE_CLASS_PAPER', 'A subject can appear only once per class in this timetable.');
        subjects.add(key);
    }
}
exports.saveTimetableSchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(), kind: exports.assessmentKindSchema, format: exports.timetableFormatSchema.nullable().optional(), expectedVersion: zod_1.z.number().int().nonnegative(),
    title: zod_1.z.string().trim().min(1).max(120), entries: zod_1.z.array(exports.examEntrySchema).max(500),
}).strict().refine(input => new Set(input.entries.map(entry => entry.id)).size === input.entries.length, 'Each exam row needs a unique ID');
exports.timetableVersionSchema = zod_1.z.object({ termId: zod_1.z.string().uuid(), kind: exports.assessmentKindSchema, expectedVersion: zod_1.z.number().int().positive() }).strict();
exports.publishedQuerySchema = zod_1.z.object({ kind: exports.assessmentKindSchema, termId: zod_1.z.string().uuid().optional(), studentId: zod_1.z.string().uuid().optional() });
function examEntriesSignature(entries) {
    return JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)).map(entry => [entry.id, entry.classId, entry.subjectId, entry.date, entry.startTime, entry.endTime, entry.venue, entry.note]));
}
function validateExamClashes(entries) {
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        for (const other of entries.slice(index + 1)) {
            if (entry.date !== other.date || entry.startTime >= other.endTime || other.startTime >= entry.endTime)
                continue;
            if (entry.classId === other.classId)
                throw new errors_1.AppError(409, 'CLASS_EXAM_CLASH', 'This class has overlapping exams on ' + entry.date + '. Check the start and end times.');
            const sameVenue = entry.venue && entry.venue.trim().toLowerCase() === other.venue.trim().toLowerCase();
            const sharedPaper = entry.subjectId === other.subjectId && entry.startTime === other.startTime && entry.endTime === other.endTime;
            if (sameVenue && !sharedPaper)
                throw new errors_1.AppError(409, 'VENUE_EXAM_CLASH', entry.venue + ' is already used for a different exam during this time.');
        }
    }
}
