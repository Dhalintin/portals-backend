"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkScoresBodySchema = exports.entrySheetQuerySchema = exports.classIdParamSchema = exports.termIdQuerySchema = void 0;
const zod_1 = require("zod");
exports.termIdQuerySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
});
exports.classIdParamSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
});
exports.entrySheetQuerySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
});
exports.bulkScoresBodySchema = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    scores: zod_1.z
        .array(zod_1.z.object({
        studentId: zod_1.z.string().uuid(),
        ca1: zod_1.z.number().min(0).max(100).optional().nullable(),
        ca2: zod_1.z.number().min(0).max(100).optional().nullable(),
        exam: zod_1.z.number().min(0).max(100).optional().nullable(),
        remark: zod_1.z.string().trim().max(300).optional().nullable(),
    }))
        .min(1)
        .max(200),
});
