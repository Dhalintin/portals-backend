import { z } from "zod";
import { GenderType } from "@prisma/client";

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable().optional();
const email = z.preprocess(value => typeof value === "string" ? value.trim().toLowerCase() || null : value,
  z.string().email().max(254).nullable().optional());
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(value => { const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Invalid calendar date")
  .refine(value => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10), "Date of birth must be between 1900 and today")
  .transform(value => new Date(`${value}T00:00:00.000Z`)).nullable().optional();

export const studentImportRowSchema = z.object({
  rowNumber: z.number().int().positive(), admissionNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  otherNames: optionalText(80), gender: z.nativeEnum(GenderType).nullable().optional(), dateOfBirth: birthDate,
  className: optionalText(80), classArm: optionalText(40), parentPhone: optionalText(30), parentEmail: email,
}).strict().refine(row => !row.classArm || Boolean(row.className), { path: ["classArm"], message: "Class arm requires class name" });

export const parentImportRowSchema = z.object({
  rowNumber: z.number().int().positive(), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  phone: optionalText(30), email, studentAdmissionNumber: optionalText(40), relation: optionalText(40),
}).strict();

const envelope = z.object({ dryRun: z.boolean().default(true), idempotencyKey: z.string().trim().min(8).max(128).optional(),
  rows: z.array(z.unknown()).min(1).max(2000) });
const requireKey = (input: { dryRun: boolean; idempotencyKey?: string }, ctx: z.RefinementCtx) => {
  if (!input.dryRun && !input.idempotencyKey) ctx.addIssue({ code: "custom", path: ["idempotencyKey"], message: "A committed import requires an idempotency key" });
};
export const importStudentsSchema = envelope.extend({ sessionId: z.string().uuid().optional() }).strict().superRefine(requireKey);
export const importParentsSchema = envelope.strict().superRefine(requireKey);
