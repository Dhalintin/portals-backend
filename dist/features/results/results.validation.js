"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listResultsQuerySchema = exports.publishClassTermSchema = exports.transitionResultSchema = exports.bulkScoresByClassSubjectSchema = exports.upsertScoresSchema = exports.scoreEntrySchema = exports.bulkCreateResultSheetsSchema = exports.createResultSheetSchema = exports.entrySheetQuerySchema = exports.upsertGradeScaleSchema = exports.gradeBandSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const resultStatusEnum = zod_1.z.nativeEnum(client_1.ResultStatus, {
    error: "Please select a valid result status.",
});
exports.gradeBandSchema = zod_1.z.object({
    min: zod_1.z
        .number()
        .min(0, "Must be at least 0.")
        .max(100, "Must not exceed 100."),
    max: zod_1.z
        .number()
        .min(0, "Must be at least 0.")
        .max(100, "Must not exceed 100."),
    grade: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(10, "Must not exceed 10 characters."),
    remark: zod_1.z.string().max(100, "Must not exceed 100 characters.").optional(),
});
exports.upsertGradeScaleSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(80, "Must not exceed 80 characters.")
        .default("Default"),
    bands: zod_1.z.array(exports.gradeBandSchema).min(1, "Please provide at least 1 item(s)."),
    isDefault: zod_1.z.boolean().default(true),
});
exports.entrySheetQuerySchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(), termId: zod_1.z.string().uuid(), subjectId: zod_1.z.string().uuid(),
});
exports.createResultSheetSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid("Please provide a valid ID."),
    termId: zod_1.z.string().uuid("Please provide a valid ID."),
    classId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
});
exports.bulkCreateResultSheetsSchema = zod_1.z.object({
    termId: zod_1.z.string().uuid("Please provide a valid ID."),
    classId: zod_1.z.string().uuid("Please provide a valid ID."),
});
exports.scoreEntrySchema = zod_1.z.object({
    subjectId: zod_1.z.string().uuid("Please provide a valid ID."),
    ca1: zod_1.z
        .number()
        .min(0, "Must be at least 0.")
        .max(100, "Must not exceed 100.")
        .nullable()
        .optional(),
    ca2: zod_1.z
        .number()
        .min(0, "Must be at least 0.")
        .max(100, "Must not exceed 100.")
        .nullable()
        .optional(),
    exam: zod_1.z
        .number()
        .min(0, "Must be at least 0.")
        .max(100, "Must not exceed 100.")
        .nullable()
        .optional(),
    remark: zod_1.z
        .string()
        .max(200, "Must not exceed 200 characters.")
        .nullable()
        .optional(),
});
exports.upsertScoresSchema = zod_1.z.object({
    resultId: zod_1.z.string().uuid("Please provide a valid ID."),
    scores: zod_1.z
        .array(exports.scoreEntrySchema)
        .min(1, "Please provide at least 1 item(s)."),
});
exports.bulkScoresByClassSubjectSchema = zod_1.z.object({
    termId: zod_1.z.string().uuid("Please provide a valid ID."),
    classId: zod_1.z.string().uuid("Please provide a valid ID."),
    subjectId: zod_1.z.string().uuid("Please provide a valid ID."),
    entries: zod_1.z
        .array(zod_1.z.object({
        studentId: zod_1.z.string().uuid("Please provide a valid ID."),
        ca1: zod_1.z
            .number()
            .min(0, "Must be at least 0.")
            .max(100, "Must not exceed 100.")
            .nullable()
            .optional(),
        ca2: zod_1.z
            .number()
            .min(0, "Must be at least 0.")
            .max(100, "Must not exceed 100.")
            .nullable()
            .optional(),
        exam: zod_1.z
            .number()
            .min(0, "Must be at least 0.")
            .max(100, "Must not exceed 100.")
            .nullable()
            .optional(),
        remark: zod_1.z
            .string()
            .max(200, "Must not exceed 200 characters.")
            .nullable()
            .optional(),
    }))
        .min(1, "Must be at least 1 characters long.")
        .max(200, "Must not exceed 200 characters."),
});
exports.transitionResultSchema = zod_1.z.object({
    status: resultStatusEnum,
});
exports.publishClassTermSchema = zod_1.z.object({
    termId: zod_1.z.string().uuid("Please provide a valid ID."),
    classId: zod_1.z.string().uuid("Please provide a valid ID."),
    publish: zod_1.z.boolean().default(true),
});
exports.listResultsQuerySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    classId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    status: resultStatusEnum.optional(),
    isPublished: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    studentId: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(200, "Must not exceed 200.")
        .default(50),
    cursor: zod_1.z.string().uuid("Please provide a valid ID.").optional(),
});
// import { z } from "zod";
// import { ResultStatus } from "@prisma/client";
// const resultStatusEnum = z.nativeEnum(ResultStatus);
// export const gradeBandSchema = z.object({
//   min: z.number().min(0).max(100),
//   max: z.number().min(0).max(100),
//   grade: z.string().min(1).max(10),
//   remark: z.string().max(100).optional(),
// });
// export const upsertGradeScaleSchema = z.object({
//   name: z.string().min(1).max(80).default("Default"),
//   bands: z.array(gradeBandSchema).min(1),
//   isDefault: z.boolean().default(true),
// });
// export const createResultSheetSchema = z.object({
//   studentId: z.string().uuid(),
//   termId: z.string().uuid(),
//   classId: z.string().uuid().optional(),
// });
// export const bulkCreateResultSheetsSchema = z.object({
//   termId: z.string().uuid(),
//   classId: z.string().uuid(),
// });
// export const scoreEntrySchema = z.object({
//   subjectId: z.string().uuid(),
//   ca1: z.number().min(0).max(100).nullable().optional(),
//   ca2: z.number().min(0).max(100).nullable().optional(),
//   exam: z.number().min(0).max(100).nullable().optional(),
//   remark: z.string().max(200).nullable().optional(),
// });
// export const upsertScoresSchema = z.object({
//   resultId: z.string().uuid(),
//   scores: z.array(scoreEntrySchema).min(1),
// });
// export const bulkScoresByClassSubjectSchema = z.object({
//   termId: z.string().uuid(),
//   classId: z.string().uuid(),
//   subjectId: z.string().uuid(),
//   entries: z
//     .array(
//       z.object({
//         studentId: z.string().uuid(),
//         ca1: z.number().min(0).max(100).nullable().optional(),
//         ca2: z.number().min(0).max(100).nullable().optional(),
//         exam: z.number().min(0).max(100).nullable().optional(),
//         remark: z.string().max(200).nullable().optional(),
//       })
//     )
//     .min(1)
//     .max(200),
// });
// export const transitionResultSchema = z.object({
//   status: resultStatusEnum,
// });
// export const publishClassTermSchema = z.object({
//   termId: z.string().uuid(),
//   classId: z.string().uuid(),
//   publish: z.boolean().default(true),
// });
// export const listResultsQuerySchema = z.object({
//   termId: z.string().uuid().optional(),
//   classId: z.string().uuid().optional(),
//   status: resultStatusEnum.optional(),
//   isPublished: z
//     .enum(["true", "false"])
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   studentId: z.string().uuid().optional(),
//   limit: z.coerce.number().int().min(1).max(200).default(50),
//   cursor: z.string().uuid().optional(),
// });
// export type UpsertGradeScaleInput = z.infer<typeof upsertGradeScaleSchema>;
// export type ScoreEntryInput = z.infer<typeof scoreEntrySchema>;
// export type BulkScoresInput = z.infer<typeof bulkScoresByClassSubjectSchema>;
