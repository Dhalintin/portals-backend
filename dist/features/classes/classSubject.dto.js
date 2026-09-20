"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classSubjectParamsSchema = exports.addClassSubjectBodySchema = exports.setClassSubjectsBodySchema = exports.classIdForClassSubjectParamsSchema = void 0;
// src/features/classes/classSubject.dto.ts
const zod_1 = require("zod");
exports.classIdForClassSubjectParamsSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
});
exports.setClassSubjectsBodySchema = zod_1.z.object({
    subjectIds: zod_1.z.array(zod_1.z.string().uuid()).max(100),
});
exports.addClassSubjectBodySchema = zod_1.z.object({
    subjectId: zod_1.z.string().uuid(),
});
exports.classSubjectParamsSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
});
