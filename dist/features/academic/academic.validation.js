"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.termIdParamsSchema = exports.updateTermSchema = exports.createTermSchema = exports.sessionIdParamsSchema = exports.updateSessionSchema = exports.createSessionSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.createSessionSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(2, "Must be at least 2 characters long.")
        .max(40, "Must not exceed 40 characters."),
    startDate: zod_1.z.coerce.date().optional().nullable(),
    endDate: zod_1.z.coerce.date().optional().nullable(),
    isCurrent: zod_1.z.boolean().optional(),
});
exports.updateSessionSchema = exports.createSessionSchema.partial();
exports.sessionIdParamsSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid("Please provide a valid ID."),
});
const calendarDate = zod_1.z.union([zod_1.z.date(), zod_1.z.string().refine(value => {
        if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))
            return false;
        const day = value.slice(0, 10), date = new Date(day + 'T00:00:00.000Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day && Number.isFinite(new Date(value).getTime());
    }, 'Enter a real calendar date.').transform(value => new Date(value.slice(0, 10) + 'T00:00:00.000Z'))]);
exports.createTermSchema = zod_1.z.object({
    name: zod_1.z.nativeEnum(client_1.TermName, { error: "Please select a valid term." }),
    startDate: calendarDate.optional().nullable(),
    endDate: calendarDate.optional().nullable(),
    isCurrent: zod_1.z.boolean().optional(),
});
exports.updateTermSchema = zod_1.z.object({
    startDate: calendarDate.optional().nullable(),
    endDate: calendarDate.optional().nullable(),
    isCurrent: zod_1.z.boolean().optional(),
});
exports.termIdParamsSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid("Please provide a valid ID."),
    termId: zod_1.z.string().uuid("Please provide a valid ID."),
});
// import { z } from "zod";
// import { TermName } from "@prisma/client";
// export const createSessionSchema = z.object({
//   name: z.string().trim().min(2).max(40), // e.g. 2025/2026
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });
// export const updateSessionSchema = createSessionSchema.partial();
// export const sessionIdParamsSchema = z.object({
//   sessionId: z.string().uuid(),
// });
// export const createTermSchema = z.object({
//   name: z.nativeEnum(TermName),
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });
// export const updateTermSchema = z.object({
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });
// export const termIdParamsSchema = z.object({
//   sessionId: z.string().uuid(),
//   termId: z.string().uuid(),
// });
