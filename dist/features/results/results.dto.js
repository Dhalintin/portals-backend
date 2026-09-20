"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyResultBodySchema = exports.resultsStatsQuerySchema = exports.recalculatePositionsBodySchema = exports.publishResultsBodySchema = exports.updateResultBodySchema = exports.bulkScoresBodySchema = exports.upsertScoresBodySchema = exports.upsertScoreItemSchema = exports.classTermSubjectQuerySchema = exports.studentTermParamsSchema = exports.resultIdParamSchema = exports.listResultsQuerySchema = void 0;
const zod_1 = require("zod");
const uuid = zod_1.z.string().uuid();
const scoreValue = zod_1.z
    .number()
    .min(0, "Score cannot be negative")
    .max(100, "Score cannot exceed 100")
    .nullable()
    .optional();
exports.listResultsQuerySchema = zod_1.z.object({
    termId: uuid.optional(),
    classId: uuid.optional(),
    studentId: uuid.optional(),
    isPublished: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().trim().max(100).optional(),
});
exports.resultIdParamSchema = zod_1.z.object({
    id: uuid,
});
exports.studentTermParamsSchema = zod_1.z.object({
    studentId: uuid,
    termId: uuid,
});
exports.classTermSubjectQuerySchema = zod_1.z.object({
    classId: uuid,
    termId: uuid,
    subjectId: uuid,
});
exports.upsertScoreItemSchema = zod_1.z.object({
    subjectId: uuid,
    ca1: scoreValue,
    ca2: scoreValue,
    exam: scoreValue,
    remark: zod_1.z.string().trim().max(500).nullable().optional(),
});
exports.upsertScoresBodySchema = zod_1.z.object({
    scores: zod_1.z.array(exports.upsertScoreItemSchema).min(1),
    /** Optional principal/form-teacher remark on the Result */
    remark: zod_1.z.string().trim().max(1000).nullable().optional(),
});
/** Teacher bulk entry: one subject across a class for a term */
exports.bulkScoresBodySchema = zod_1.z.object({
    classId: uuid,
    termId: uuid,
    subjectId: uuid,
    scores: zod_1.z
        .array(zod_1.z.object({
        studentId: uuid,
        ca1: scoreValue,
        ca2: scoreValue,
        exam: scoreValue,
        remark: zod_1.z.string().trim().max(500).nullable().optional(),
    }))
        .min(1),
});
exports.updateResultBodySchema = zod_1.z.object({
    remark: zod_1.z.string().trim().max(1000).nullable().optional(),
    grade: zod_1.z.string().trim().max(10).nullable().optional(),
});
exports.publishResultsBodySchema = zod_1.z.object({
    termId: uuid,
    /** If omitted, all classes in the term for this school */
    classId: uuid.optional(),
    isPublished: zod_1.z.boolean(),
});
exports.recalculatePositionsBodySchema = zod_1.z.object({
    termId: uuid,
    classId: uuid,
});
exports.resultsStatsQuerySchema = zod_1.z.object({
    termId: uuid,
    classId: uuid.optional(),
});
/** Public parent check — no JWT */
exports.verifyResultBodySchema = zod_1.z.object({
    schoolSlug: zod_1.z.string().trim().min(1).max(100),
    admissionNumber: zod_1.z.string().trim().min(1).max(50),
    pin: zod_1.z.string().trim().min(4).max(64),
});
