"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importParentsSchema = exports.importStudentsSchema = exports.parentImportRowSchema = exports.studentImportRowSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const optionalText = (max) => zod_1.z.string().trim().max(max).transform(value => value || null).nullable().optional();
const email = zod_1.z.preprocess(value => typeof value === "string" ? value.trim().toLowerCase() || null : value, zod_1.z.string().email().max(254).nullable().optional());
const birthDate = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine(value => { const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Invalid calendar date")
    .refine(value => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10), "Date of birth must be between 1900 and today")
    .transform(value => new Date(`${value}T00:00:00.000Z`)).nullable().optional();
exports.studentImportRowSchema = zod_1.z.object({
    rowNumber: zod_1.z.number().int().positive(), admissionNumber: zod_1.z.string().trim().min(1).max(40),
    firstName: zod_1.z.string().trim().min(1).max(80), lastName: zod_1.z.string().trim().min(1).max(80),
    otherNames: optionalText(80), gender: zod_1.z.nativeEnum(client_1.GenderType).nullable().optional(), dateOfBirth: birthDate,
    className: optionalText(80), classArm: optionalText(40), parentPhone: optionalText(30), parentEmail: email,
}).strict().refine(row => !row.classArm || Boolean(row.className), { path: ["classArm"], message: "Class arm requires class name" });
exports.parentImportRowSchema = zod_1.z.object({
    rowNumber: zod_1.z.number().int().positive(), firstName: zod_1.z.string().trim().min(1).max(80), lastName: zod_1.z.string().trim().min(1).max(80),
    phone: optionalText(30), email, studentAdmissionNumber: optionalText(40), relation: optionalText(40),
}).strict();
const envelope = zod_1.z.object({ dryRun: zod_1.z.boolean().default(true), idempotencyKey: zod_1.z.string().trim().min(8).max(128).optional(),
    rows: zod_1.z.array(zod_1.z.unknown()).min(1).max(2000) });
const requireKey = (input, ctx) => {
    if (!input.dryRun && !input.idempotencyKey)
        ctx.addIssue({ code: "custom", path: ["idempotencyKey"], message: "A committed import requires an idempotency key" });
};
exports.importStudentsSchema = envelope.extend({ sessionId: zod_1.z.string().uuid().optional() }).strict().superRefine(requireKey);
exports.importParentsSchema = envelope.strict().superRefine(requireKey);
