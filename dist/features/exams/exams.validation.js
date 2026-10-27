"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishedQuerySchema = exports.timetableVersionSchema = exports.saveTimetableSchema = exports.examEntrySchema = void 0;
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
exports.saveTimetableSchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(), expectedVersion: zod_1.z.number().int().nonnegative(),
    title: zod_1.z.string().trim().min(1).max(120), entries: zod_1.z.array(exports.examEntrySchema).max(500),
}).strict().refine(input => new Set(input.entries.map(entry => entry.id)).size === input.entries.length, 'Each exam row needs a unique ID');
exports.timetableVersionSchema = zod_1.z.object({ termId: zod_1.z.string().uuid(), expectedVersion: zod_1.z.number().int().positive() }).strict();
exports.publishedQuerySchema = zod_1.z.object({ termId: zod_1.z.string().uuid().optional(), studentId: zod_1.z.string().uuid().optional() });
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
