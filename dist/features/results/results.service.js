"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultsService = exports.ResultsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
const rbac_1 = require("../../auth/rbac");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const studentNotifications_1 = require("../../lib/studentNotifications");
const audit_service_1 = require("../audit/audit.service");
function computeTotal(ca1, ca2, exam) {
    const a = ca1 ?? 0;
    const b = ca2 ?? 0;
    const e = exam ?? 0;
    return Math.round((a + b + e) * 100) / 100;
}
function gradeFromBands(total, bands) {
    const sorted = [...bands].sort((x, y) => y.min - x.min);
    for (const band of sorted) {
        // Scores may contain decimals; integer endpoint bands classify the
        // completed whole mark (69.5 remains B, rather than falling into a gap).
        if (Math.floor(total) >= band.min && Math.floor(total) <= band.max) {
            return { grade: band.grade, remark: band.remark };
        }
    }
    // fallback
    return { grade: "F", remark: "Fail" };
}
class ResultsService {
    async entrySheet(organizationId, actorId, input) {
        await (0, resourceAccess_1.assertTeachingAccess)(organizationId, actorId, input.classId, input.subjectId);
        const term = await prisma_1.prisma.term.findFirst({ where: { id: input.termId, session: { organizationId } }, select: { id: true } });
        if (!term)
            throw new errors_1.AppError(404, "TERM_NOT_FOUND", "Term not found");
        const subject = await prisma_1.prisma.subject.findFirst({ where: { id: input.subjectId, organizationId, isActive: true }, select: { id: true, name: true, code: true } });
        if (!subject)
            throw new errors_1.AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
        const students = await prisma_1.prisma.student.findMany({ where: { organizationId, classId: input.classId, isActive: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, otherNames: true, admissionNumber: true, results: { where: { organizationId, termId: input.termId }, select: { id: true, status: true, scores: { where: { subjectId: input.subjectId }, select: { id: true, ca1: true, ca2: true, exam: true, total: true, grade: true, remark: true } } } } } });
        return { ...input, subject, students: students.map(student => { const result = student.results[0], score = result?.scores[0]; return { studentId: student.id, firstName: student.firstName, lastName: student.lastName, otherNames: student.otherNames, admissionNumber: student.admissionNumber, resultId: result?.id ?? null, status: result?.status ?? "DRAFT", scoreId: score?.id ?? null, ca1: score?.ca1 ?? null, ca2: score?.ca2 ?? null, exam: score?.exam ?? null, total: score?.total ?? null, grade: score?.grade ?? null, remark: score?.remark ?? null }; }) };
    }
    // ─── Grade Scale ───────────────────────────────────────────────
    async getGradeScale(organizationId) {
        const scale = await prisma_1.prisma.gradeScale.findFirst({
            where: { organizationId, isDefault: true },
        });
        if (!scale) {
            // sensible Nigerian-style default
            return {
                id: null,
                name: "Default",
                bands: [
                    { min: 70, max: 100, grade: "A", remark: "Excellent" },
                    { min: 60, max: 69, grade: "B", remark: "Very Good" },
                    { min: 50, max: 59, grade: "C", remark: "Good" },
                    { min: 45, max: 49, grade: "D", remark: "Pass" },
                    { min: 40, max: 44, grade: "E", remark: "Fair" },
                    { min: 0, max: 39, grade: "F", remark: "Fail" },
                ],
                isDefault: true,
            };
        }
        return scale;
    }
    async upsertGradeScale(organizationId, input, actorId, meta) {
        // Validate non-overlapping bands lightly
        const bands = input.bands;
        const sorted = [...bands].sort((a, b) => a.min - b.min);
        if (sorted[0].min !== 0 || sorted[sorted.length - 1].max !== 100 ||
            sorted.some((band) => !Number.isInteger(band.min) || !Number.isInteger(band.max) || band.min > band.max)) {
            throw new errors_1.AppError(400, "INVALID_BANDS", "Use whole-mark bands covering 0 through 100");
        }
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].min !== sorted[i - 1].max + 1) {
                throw new errors_1.AppError(400, "INVALID_BANDS", "Grade bands must be continuous and must not overlap");
            }
        }
        const existing = await prisma_1.prisma.gradeScale.findFirst({
            where: { organizationId, isDefault: true },
        });
        let scale;
        if (existing) {
            scale = await prisma_1.prisma.gradeScale.update({
                where: { id: existing.id },
                data: {
                    name: input.name,
                    bands: input.bands,
                    isDefault: true,
                },
            });
        }
        else {
            scale = await prisma_1.prisma.gradeScale.create({
                data: {
                    organizationId,
                    name: input.name,
                    bands: input.bands,
                    isDefault: true,
                },
            });
        }
        await audit_service_1.auditService.write({
            action: "SETTINGS_CHANGED",
            actorId,
            organizationId,
            entity: "GradeScale",
            entityId: scale.id,
            metadata: { name: scale.name },
            requestId: meta?.requestId,
        });
        return scale;
    }
    // ─── Result sheets ─────────────────────────────────────────────
    async getOrCreateResultSheet(organizationId, studentId, termId, classId) {
        const existing = await prisma_1.prisma.result.findUnique({
            where: { studentId_termId: { studentId, termId } },
            include: { scores: { include: { subject: true } } },
        });
        if (existing) {
            if (existing.organizationId !== organizationId) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Result does not belong to this school");
            }
            return existing;
        }
        // Validate student + term belong to school
        const [student, term] = await Promise.all([
            prisma_1.prisma.student.findFirst({
                where: { id: studentId, organizationId, isActive: true },
                select: { id: true, classId: true },
            }),
            prisma_1.prisma.term.findFirst({
                where: { id: termId, session: { organizationId } },
                select: { id: true },
            }),
        ]);
        if (!student)
            throw new errors_1.AppError(404, "STUDENT_NOT_FOUND", "Student not found");
        if (!term)
            throw new errors_1.AppError(404, "TERM_NOT_FOUND", "Term not found");
        if (classId && classId !== student.classId) {
            throw new errors_1.AppError(400, "CLASS_MISMATCH", "Result class must match the student's class");
        }
        return prisma_1.prisma.result.create({
            data: {
                organizationId,
                studentId,
                termId,
                classId: classId ?? student.classId,
                status: "DRAFT",
            },
            include: { scores: { include: { subject: true } } },
        });
    }
    async bulkCreateSheetsForClass(organizationId, termId, classId) {
        const students = await prisma_1.prisma.student.findMany({
            where: { organizationId, classId, isActive: true },
            select: { id: true },
        });
        const created = [];
        for (const s of students) {
            const sheet = await this.getOrCreateResultSheet(organizationId, s.id, termId, classId);
            created.push(sheet);
        }
        return { count: created.length, results: created };
    }
    // ─── Scores ────────────────────────────────────────────────────
    async upsertScores(organizationId, resultId, scores, actorId, meta) {
        const result = await prisma_1.prisma.result.findFirst({
            where: { id: resultId, organizationId },
        });
        if (!result)
            throw new errors_1.AppError(404, "NOT_FOUND", "Result sheet not found");
        if (result.status !== "DRAFT") {
            throw new errors_1.AppError(400, "LOCKED", "Return results to draft before editing scores");
        }
        if (!result.classId)
            throw new errors_1.AppError(400, "CLASS_REQUIRED", "Result sheet must belong to a class");
        for (const entry of scores) {
            await (0, resourceAccess_1.assertSubjectTeacher)(organizationId, actorId, result.classId, entry.subjectId);
        }
        const scale = await this.getGradeScale(organizationId);
        const bands = scale.bands || [];
        const updatedScores = await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const current = await tx.result.findFirst({ where: { id: resultId, organizationId } });
            if (!current || current.status !== "DRAFT")
                throw new errors_1.AppError(409, "LOCKED", "Result is no longer editable");
            const out = [];
            for (const entry of scores) {
                await (0, resourceAccess_1.assertSubjectTeacher)(organizationId, actorId, current.classId, entry.subjectId, tx);
                const previous = await tx.score.findUnique({ where: { resultId_subjectId: { resultId, subjectId: entry.subjectId } } });
                const ca1 = entry.ca1 === undefined ? previous?.ca1 ?? 0 : entry.ca1 ?? 0;
                const ca2 = entry.ca2 === undefined ? previous?.ca2 ?? 0 : entry.ca2 ?? 0;
                const exam = entry.exam === undefined ? previous?.exam ?? 0 : entry.exam ?? 0;
                const total = computeTotal(ca1, ca2, exam);
                if (total > 100)
                    throw new errors_1.AppError(400, "INVALID_SCORE", "CA and exam total cannot exceed 100");
                const { grade, remark: bandRemark } = gradeFromBands(total, bands);
                const score = await tx.score.upsert({
                    where: {
                        resultId_subjectId: {
                            resultId,
                            subjectId: entry.subjectId,
                        },
                    },
                    create: {
                        resultId,
                        subjectId: entry.subjectId,
                        ca1: entry.ca1 ?? 0,
                        ca2: entry.ca2 ?? 0,
                        exam: entry.exam ?? 0,
                        total,
                        grade,
                        remark: entry.remark ?? bandRemark ?? null,
                    },
                    update: {
                        ca1,
                        ca2,
                        exam,
                        total,
                        grade,
                        remark: entry.remark ?? bandRemark ?? undefined,
                    },
                });
                out.push(score);
            }
            // Recompute result aggregates
            const allScores = await tx.score.findMany({ where: { resultId } });
            const sum = allScores.reduce((acc, s) => acc + (s.total ?? 0), 0);
            const count = allScores.length || 1;
            const percentage = Math.round((sum / count) * 100) / 100;
            const overall = gradeFromBands(percentage, bands);
            await tx.result.update({
                where: { id: resultId },
                data: {
                    totalScore: sum,
                    percentage,
                    grade: overall.grade,
                    remark: overall.remark,
                },
            });
            return out;
        });
        await audit_service_1.auditService.write({
            action: "RESULT_SUBMITTED", // or a more generic one; we can add SCORE_UPDATED later
            actorId,
            organizationId,
            entity: "Result",
            entityId: resultId,
            metadata: { scoresCount: scores.length },
            requestId: meta?.requestId,
        });
        return this.getResult(organizationId, resultId);
    }
    async bulkScoresByClassSubject(organizationId, input, actorId, meta) {
        await (0, resourceAccess_1.assertSubjectTeacher)(organizationId, actorId, input.classId, input.subjectId);
        const studentIds = [...new Set(input.entries.map((entry) => entry.studentId))];
        const studentCount = await prisma_1.prisma.student.count({
            where: { organizationId, classId: input.classId, isActive: true, id: { in: studentIds } },
        });
        if (studentCount !== studentIds.length)
            throw new errors_1.AppError(400, "INVALID_STUDENT", "All students must belong to this class");
        const results = [];
        for (const entry of input.entries) {
            const sheet = await this.getOrCreateResultSheet(organizationId, entry.studentId, input.termId, input.classId);
            const updated = await this.upsertScores(organizationId, sheet.id, [
                {
                    subjectId: input.subjectId,
                    ca1: entry.ca1,
                    ca2: entry.ca2,
                    exam: entry.exam,
                    remark: entry.remark,
                },
            ], actorId, meta);
            results.push(updated);
        }
        return { count: results.length, results };
    }
    // ─── Workflow ──────────────────────────────────────────────────
    async transitionStatus(organizationId, resultId, newStatus, actorId, meta) {
        const membership = await prisma_1.prisma.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true } });
        if (!membership || !(0, rbac_1.permissionsForOrgRole)(membership.role).includes("results:write")) {
            throw new errors_1.AppError(403, "FORBIDDEN", "Result write permission required");
        }
        if ((newStatus === "APPROVED" || newStatus === "PUBLISHED") &&
            !(0, rbac_1.permissionsForOrgRole)(membership.role).includes("results:publish")) {
            throw new errors_1.AppError(403, "FORBIDDEN", "Result approval or publishing permission required");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const manager = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } } });
            if (!manager || !(0, rbac_1.permissionsForOrgRole)(manager.role).includes("results:write") ||
                (["APPROVED", "PUBLISHED"].includes(newStatus) && !(0, rbac_1.permissionsForOrgRole)(manager.role).includes("results:publish"))) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Current result workflow permission required");
            }
            const result = await tx.result.findFirst({ where: { id: resultId, organizationId } });
            if (!result)
                throw new errors_1.AppError(404, "NOT_FOUND", "Result not found");
            if (result.classId)
                await (0, resourceAccess_1.assertTeachingAccess)(organizationId, actorId, result.classId, undefined, tx);
            if (result.status === newStatus)
                return result;
            const allowed = { DRAFT: ["SUBMITTED"], SUBMITTED: ["APPROVED", "DRAFT"], APPROVED: ["PUBLISHED", "SUBMITTED"], PUBLISHED: [] };
            if (!allowed[result.status].includes(newStatus))
                throw new errors_1.AppError(400, "INVALID_TRANSITION", `Cannot move from ${result.status} to ${newStatus}`);
            const updated = await tx.result.update({ where: { id: resultId }, data: { status: newStatus,
                    ...(newStatus === "PUBLISHED" ? { isPublished: true, publishedAt: new Date() } : {}) } });
            if (newStatus === "PUBLISHED")
                await (0, studentNotifications_1.enqueueResultPublications)(tx, organizationId, [updated]);
            const action = { SUBMITTED: "RESULT_SUBMITTED", APPROVED: "RESULT_APPROVED", PUBLISHED: "RESULT_PUBLISHED" };
            if (newStatus !== "DRAFT")
                await tx.auditLog.create({ data: { action: action[newStatus], actorId, organizationId,
                        entity: "Result", entityId: resultId, metadata: { from: result.status, to: newStatus }, requestId: meta?.requestId } });
            return updated;
        });
    }
    async publishClassTerm(organizationId, termId, classId, publish, actorId, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const membership = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } } });
            if (!membership || !(0, rbac_1.permissionsForOrgRole)(membership.role).includes("results:publish"))
                throw new errors_1.AppError(403, "FORBIDDEN", "Result publishing permission required");
            await (0, resourceAccess_1.assertTeachingAccess)(organizationId, actorId, classId, undefined, tx);
            if (!await tx.term.findFirst({ where: { id: termId, session: { organizationId } } }))
                throw new errors_1.AppError(404, "NOT_FOUND", "Term not found");
            const rows = await tx.result.findMany({ where: { organizationId, termId, classId, ...(publish ? { status: "APPROVED" } : { isPublished: true }) } });
            if (!rows.length)
                return { updated: 0 };
            const ids = rows.map(row => row.id);
            const updated = await tx.result.updateMany({ where: { organizationId, id: { in: ids } }, data: publish
                    ? { status: "PUBLISHED", isPublished: true, publishedAt: new Date() }
                    : { isPublished: false, publishedAt: null, status: "APPROVED" } });
            if (publish)
                await (0, studentNotifications_1.enqueueResultPublications)(tx, organizationId, await tx.result.findMany({ where: { organizationId, id: { in: ids } } }));
            else
                await tx.notificationOutbox.updateMany({ where: { organizationId, entityType: "Result", entityId: { in: ids }, status: "PENDING" },
                    data: { status: "CANCELLED", lockedAt: null, error: "RESULT_UNPUBLISHED" } });
            await tx.auditLog.create({ data: { action: publish ? "RESULT_PUBLISHED" : "SETTINGS_CHANGED", actorId, organizationId,
                    entity: "Result", metadata: { termId, classId, publish, count: updated.count }, requestId: meta?.requestId } });
            return { updated: updated.count };
        });
    }
    // ─── Positions ─────────────────────────────────────────────────
    async recalculatePositions(organizationId, termId, classId) {
        const results = await prisma_1.prisma.result.findMany({
            where: { organizationId, termId, classId },
            orderBy: [{ percentage: "desc" }, { totalScore: "desc" }],
            select: { id: true, percentage: true },
        });
        // Dense rank
        let position = 0;
        let lastPct = null;
        const updates = [];
        for (const r of results) {
            if (r.percentage !== lastPct) {
                position += 1;
                lastPct = r.percentage;
            }
            updates.push(prisma_1.prisma.result.update({
                where: { id: r.id },
                data: { position },
            }));
        }
        await prisma_1.prisma.$transaction(updates);
        return { ranked: results.length };
    }
    // ─── Reads ─────────────────────────────────────────────────────
    async getResult(organizationId, resultId, auth) {
        const result = await prisma_1.prisma.result.findFirst({
            where: { id: resultId, organizationId, ...(auth?.orgRole === "TEACHER" ? { class: (0, resourceAccess_1.teachingClassFilter)(auth) } : {}) },
            include: {
                student: {
                    select: {
                        id: true,
                        admissionNumber: true,
                        firstName: true,
                        lastName: true,
                        otherNames: true,
                        gender: true,
                    },
                },
                term: {
                    select: { id: true, name: true, session: { select: { name: true } } },
                },
                class: { select: { id: true, name: true, arm: true } },
                scores: {
                    include: {
                        subject: { select: { id: true, name: true, code: true } },
                    },
                    orderBy: { subject: { name: "asc" } },
                },
            },
        });
        if (!result)
            throw new errors_1.AppError(404, "NOT_FOUND", "Result not found");
        return result;
    }
    async listResults(organizationId, query, auth) {
        const where = {
            organizationId,
            ...(auth?.orgRole === "TEACHER" ? { class: (0, resourceAccess_1.teachingClassFilter)(auth) } : {}),
        };
        if (query.termId)
            where.termId = query.termId;
        if (query.classId)
            where.classId = query.classId;
        if (query.status)
            where.status = query.status;
        if (query.isPublished !== undefined)
            where.isPublished = query.isPublished;
        if (query.studentId)
            where.studentId = query.studentId;
        return prisma_1.prisma.result.findMany({
            where,
            take: query.limit ?? 50,
            orderBy: [{ classId: "asc" }, { student: { lastName: "asc" } }],
            include: {
                student: {
                    select: {
                        id: true,
                        admissionNumber: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                class: { select: { id: true, name: true, arm: true } },
                term: { select: { id: true, name: true } },
            },
        });
    }
    /** Parent-facing: only published results of linked children */
    async parentResults(organizationId, parentUserId) {
        const parent = await prisma_1.prisma.parent.findFirst({
            where: { organizationId, userId: parentUserId, isActive: true },
            select: { id: true },
        });
        if (!parent) {
            throw new errors_1.AppError(403, "NOT_A_PARENT", "No parent profile linked");
        }
        const links = await prisma_1.prisma.parentStudent.findMany({
            where: { parentId: parent.id, organizationId, student: { organizationId } },
            select: { studentId: true },
        });
        const studentIds = links.map((l) => l.studentId);
        if (studentIds.length === 0)
            return [];
        return prisma_1.prisma.result.findMany({
            where: {
                organizationId,
                studentId: { in: studentIds },
                isPublished: true,
            },
            include: {
                student: {
                    select: {
                        id: true,
                        admissionNumber: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                term: {
                    select: { id: true, name: true, session: { select: { name: true } } },
                },
                class: { select: { id: true, name: true, arm: true } },
                scores: {
                    include: { subject: { select: { name: true, code: true } } },
                },
            },
            orderBy: { publishedAt: "desc" },
        });
    }
    /** Full report-card payload for PDF / frontend */
    async reportCardPayload(organizationId, resultId, auth) {
        const result = await this.getResult(organizationId, resultId, auth);
        if (!result.isPublished) {
            // allow staff to preview, but flag it
        }
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                name: true,
                logoUrl: true,
                primaryColor: true,
                accentColor: true,
                motto: true,
                address: true,
                city: true,
                state: true,
            },
        });
        return {
            school: org,
            result,
            generatedAt: new Date().toISOString(),
        };
    }
}
exports.ResultsService = ResultsService;
exports.resultsService = new ResultsService();
// import { OrgRole, PinStatus, Prisma } from "@prisma/client";
// import { prisma } from "../../lib/prisma"; // adjust path
// import {
//   AppError,
//   BadRequestError,
//   ForbiddenError,
//   NotFoundError,
// } from "../../common/errors/AppError";
// import {
//   BulkScoresBody,
//   ListResultsQuery,
//   PublishResultsBody,
//   RecalculatePositionsBody,
//   ResultsStatsQuery,
//   UpdateResultBody,
//   UpsertScoresBody,
//   VerifyResultBody,
// } from "./results.dto";
// import {
//   computeScoreTotal,
//   defaultRemarkFromGrade,
//   gradeFromTotal,
// } from "./results.grades";
// type Actor = {
//   userId: string;
//   globalRole?: string;
//   orgRole?: OrgRole | string | null;
//   schoolId: string;
// };
// const resultInclude = {
//   student: {
//     select: {
//       id: true,
//       admissionNumber: true,
//       firstName: true,
//       lastName: true,
//       otherNames: true,
//       gender: true,
//       classId: true,
//     },
//   },
//   term: {
//     select: {
//       id: true,
//       name: true,
//       isCurrent: true,
//       session: { select: { id: true, name: true, isCurrent: true } },
//     },
//   },
//   class: {
//     select: { id: true, name: true, arm: true, level: true },
//   },
//   scores: {
//     include: {
//       subject: {
//         select: { id: true, name: true, code: true },
//       },
//     },
//     orderBy: { subject: { name: "asc" as const } },
//   },
// } satisfies Prisma.ResultInclude;
// function isAdminLike(actor: Actor): boolean {
//   return (
//     actor.orgRole === OrgRole.SCHOOL_ADMIN ||
//     actor.orgRole === OrgRole.EXAM_OFFICER ||
//     actor.globalRole === "SUPER_ADMIN"
//   );
// }
// async function assertTermInOrg(termId: string, organizationId: string) {
//   const term = await prisma.term.findFirst({
//     where: {
//       id: termId,
//       session: { organizationId },
//     },
//     include: {
//       session: { select: { id: true, name: true, organizationId: true } },
//     },
//   });
//   if (!term) throw new NotFoundError("Term not found for this school");
//   return term;
// }
// async function assertStudentInOrg(studentId: string, organizationId: string) {
//   const student = await prisma.student.findFirst({
//     where: { id: studentId, organizationId, isActive: true },
//   });
//   if (!student) throw new NotFoundError("Student not found");
//   return student;
// }
// async function assertClassInOrg(classId: string, organizationId: string) {
//   const cls = await prisma.class.findFirst({
//     where: { id: classId, organizationId, isActive: true },
//   });
//   if (!cls) throw new NotFoundError("Class not found");
//   return cls;
// }
// async function assertClassOffersSubject(
//   classId: string,
//   subjectId: string,
//   organizationId: string
// ) {
//   const row = await prisma.classSubject.findFirst({
//     where: { classId, subjectId, organizationId },
//   });
//   if (!row) {
//     throw new BadRequestError(
//       "This subject is not on the class curriculum. Assign it under class subjects first."
//     );
//   }
// }
// /**
//  * Score entry: admin/exam officer always; teacher only if ClassSubjectTeacher matches.
//  */
// async function assertCanEnterSubjectScores(
//   actor: Actor,
//   classId: string,
//   subjectId: string
// ) {
//   if (isAdminLike(actor)) return;
//   const assignment = await prisma.classSubjectTeacher.findFirst({
//     where: {
//       organizationId: actor.schoolId,
//       classId,
//       subjectId,
//       userId: actor.userId,
//     },
//   });
//   if (!assignment) {
//     throw new ForbiddenError(
//       "You can only enter scores for subjects you teach in this class"
//     );
//   }
// }
// async function assertCanMutateResultScores(
//   actor: Actor,
//   result: { isPublished: boolean; organizationId: string }
// ) {
//   if (result.organizationId !== actor.schoolId) {
//     throw new ForbiddenError("Result does not belong to this school");
//   }
//   if (result.isPublished && !isAdminLike(actor)) {
//     throw new ForbiddenError(
//       "This result is published. Ask an exam officer or school admin to unpublish before editing scores."
//     );
//   }
// }
// function recomputeResultAggregates(scores: { total: number | null }[]): {
//   totalScore: number;
//   percentage: number;
//   grade: string | null;
// } {
//   const totals = scores
//     .map((s) => s.total)
//     .filter((t): t is number => t != null && !Number.isNaN(t));
//   if (totals.length === 0) {
//     return { totalScore: 0, percentage: 0, grade: null };
//   }
//   const totalScore = totals.reduce((a, b) => a + b, 0);
//   const percentage = Math.round((totalScore / totals.length) * 100) / 100;
//   return {
//     totalScore: Math.round(totalScore * 100) / 100,
//     percentage,
//     grade: gradeFromTotal(percentage),
//   };
// }
// async function refreshResultAggregates(resultId: string) {
//   const scores = await prisma.score.findMany({
//     where: { resultId },
//     select: { total: true },
//   });
//   const agg = recomputeResultAggregates(scores);
//   return prisma.result.update({
//     where: { id: resultId },
//     data: {
//       totalScore: agg.totalScore,
//       percentage: agg.percentage,
//       grade: agg.grade,
//     },
//     include: resultInclude,
//   });
// }
// export class ResultsService {
//   async list(organizationId: string, query: ListResultsQuery) {
//     const { termId, classId, studentId, isPublished, page, limit, search } =
//       query;
//     const skip = (page - 1) * limit;
//     const where: Prisma.ResultWhereInput = {
//       organizationId,
//       ...(termId ? { termId } : {}),
//       ...(classId ? { classId } : {}),
//       ...(studentId ? { studentId } : {}),
//       ...(isPublished !== undefined ? { isPublished } : {}),
//       ...(search
//         ? {
//             student: {
//               OR: [
//                 { firstName: { contains: search, mode: "insensitive" } },
//                 { lastName: { contains: search, mode: "insensitive" } },
//                 { admissionNumber: { contains: search, mode: "insensitive" } },
//               ],
//             },
//           }
//         : {}),
//     };
//     const [items, total] = await Promise.all([
//       prisma.result.findMany({
//         where,
//         include: resultInclude,
//         orderBy: [
//           { classId: "asc" },
//           { percentage: "desc" },
//           { createdAt: "desc" },
//         ],
//         skip,
//         take: Number(limit),
//       }),
//       prisma.result.count({ where }),
//     ]);
//     return {
//       items,
//       meta: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit) || 1,
//       },
//     };
//   }
//   async getById(organizationId: string, id: string) {
//     const result = await prisma.result.findFirst({
//       where: { id, organizationId },
//       include: resultInclude,
//     });
//     if (!result) throw new NotFoundError("Result not found");
//     return result;
//   }
//   async getByStudentAndTerm(
//     organizationId: string,
//     studentId: string,
//     termId: string
//   ) {
//     await assertStudentInOrg(studentId, organizationId);
//     await assertTermInOrg(termId, organizationId);
//     const result = await prisma.result.findUnique({
//       where: { studentId_termId: { studentId, termId } },
//       include: resultInclude,
//     });
//     return result; // null is fine — UI shows empty entry state
//   }
//   /**
//    * Entry sheet for a class + term + subject (teacher workflow).
//    * Returns every active student in the class with existing score for that subject if any.
//    */
//   // async getClassSubjectEntrySheet(
//   //   organizationId: string,
//   //   classId: string,
//   //   termId: string,
//   //   subjectId: string,
//   //   actor: Actor
//   // ) {
//   //   await assertClassInOrg(classId, organizationId);
//   //   await assertTermInOrg(termId, organizationId);
//   //   await assertClassOffersSubject(classId, subjectId, organizationId);
//   //   await assertCanEnterSubjectScores(actor, classId, subjectId);
//   //   const subject = await prisma.subject.findFirst({
//   //     where: { id: subjectId, organizationId, isActive: true },
//   //     select: { id: true, name: true, code: true },
//   //   });
//   //   if (!subject) throw new NotFoundError("Subject not found");
//   //   const students = await prisma.student.findMany({
//   //     where: { organizationId, classId, isActive: true },
//   //     select: {
//   //       id: true,
//   //       admissionNumber: true,
//   //       firstName: true,
//   //       lastName: true,
//   //       otherNames: true,
//   //     },
//   //     orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
//   //   });
//   //   const results = await prisma.result.findMany({
//   //     where: {
//   //       organizationId,
//   //       termId,
//   //       studentId: { in: students.map((s) => s.id) },
//   //     },
//   //     select: {
//   //       id: true,
//   //       studentId: true,
//   //       isPublished: true,
//   //       scores: {
//   //         where: { subjectId },
//   //         select: {
//   //           id: true,
//   //           ca1: true,
//   //           ca2: true,
//   //           exam: true,
//   //           total: true,
//   //           grade: true,
//   //           remark: true,
//   //         },
//   //       },
//   //     },
//   //   });
//   //   const byStudent = new Map(results.map((r) => [r.studentId, r]));
//   //   return {
//   //     classId,
//   //     termId,
//   //     subject,
//   //     isClassPublished: results.some((r) => r.isPublished),
//   //     rows: students.map((student) => {
//   //       const res = byStudent.get(student.id);
//   //       const score = res?.scores[0] ?? null;
//   //       return {
//   //         student,
//   //         resultId: res?.id ?? null,
//   //         isPublished: res?.isPublished ?? false,
//   //         score,
//   //       };
//   //     }),
//   //   };
//   // }
//   /**
//    * Class × term × subject score sheet.
//    * Ensures every active student in the class has a Result for the term
//    * and a Score for this subject (defaults ca1/ca2/exam = 0).
//    */
//   async getClassSubjectEntrySheet(
//     organizationId: string,
//     classId: string,
//     termId: string,
//     subjectId: string,
//     actor: Actor
//   ) {
//     await assertClassInOrg(classId, organizationId);
//     await assertTermInOrg(termId, organizationId);
//     await assertClassOffersSubject(classId, subjectId, organizationId);
//     await assertCanEnterSubjectScores(actor, classId, subjectId);
//     const subject = await prisma.subject.findFirst({
//       where: { id: subjectId, organizationId, isActive: true },
//       select: { id: true, name: true, code: true },
//     });
//     if (!subject) throw new NotFoundError("Subject not found");
//     const students = await prisma.student.findMany({
//       where: { organizationId, classId, isActive: true },
//       select: {
//         id: true,
//         admissionNumber: true,
//         firstName: true,
//         lastName: true,
//         otherNames: true,
//       },
//       orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
//     });
//     // Seed Result + Score (0s) for anyone missing them
//     await prisma.$transaction(async (tx) => {
//       for (const student of students) {
//         let result = await tx.result.findUnique({
//           where: {
//             studentId_termId: { studentId: student.id, termId },
//           },
//         });
//         if (!result) {
//           result = await tx.result.create({
//             data: {
//               organizationId,
//               studentId: student.id,
//               termId,
//               classId,
//               totalScore: 0,
//               percentage: 0,
//               grade: gradeFromTotal(0),
//             },
//           });
//         } else if (result.classId !== classId) {
//           await tx.result.update({
//             where: { id: result.id },
//             data: { classId },
//           });
//         }
//         const existingScore = await tx.score.findUnique({
//           where: {
//             resultId_subjectId: {
//               resultId: result.id,
//               subjectId,
//             },
//           },
//         });
//         if (!existingScore) {
//           const total = 0;
//           await tx.score.create({
//             data: {
//               resultId: result.id,
//               subjectId,
//               ca1: 0,
//               ca2: 0,
//               exam: 0,
//               total,
//               grade: gradeFromTotal(total),
//               remark: defaultRemarkFromGrade(gradeFromTotal(total)),
//             },
//           });
//           // Keep aggregates in sync if this was the first score
//           const allScores = await tx.score.findMany({
//             where: { resultId: result.id },
//             select: { total: true },
//           });
//           const agg = recomputeResultAggregates(allScores);
//           await tx.result.update({
//             where: { id: result.id },
//             data: {
//               totalScore: agg.totalScore,
//               percentage: agg.percentage,
//               grade: agg.grade,
//             },
//           });
//         }
//       }
//     });
//     const results = await prisma.result.findMany({
//       where: {
//         organizationId,
//         termId,
//         studentId: { in: students.map((s) => s.id) },
//       },
//       select: {
//         id: true,
//         studentId: true,
//         isPublished: true,
//         scores: {
//           where: { subjectId },
//           select: {
//             id: true,
//             ca1: true,
//             ca2: true,
//             exam: true,
//             total: true,
//             grade: true,
//             remark: true,
//           },
//         },
//       },
//     });
//     const byStudent = new Map(results.map((r) => [r.studentId, r]));
//     return {
//       classId,
//       termId,
//       subject,
//       isClassPublished: results.some((r) => r.isPublished),
//       rows: students.map((student) => {
//         const res = byStudent.get(student.id);
//         const score = res?.scores[0] ?? null;
//         return {
//           student,
//           resultId: res?.id ?? null,
//           isPublished: res?.isPublished ?? false,
//           score: score
//             ? {
//                 id: score.id,
//                 ca1: score.ca1 ?? 0,
//                 ca2: score.ca2 ?? 0,
//                 exam: score.exam ?? 0,
//                 total: score.total ?? 0,
//                 grade: score.grade,
//                 remark: score.remark,
//               }
//             : {
//                 id: "",
//                 ca1: 0,
//                 ca2: 0,
//                 exam: 0,
//                 total: 0,
//                 grade: gradeFromTotal(0),
//                 remark: null,
//               },
//         };
//       }),
//     };
//   }
//   async updateResultMeta(
//     organizationId: string,
//     resultId: string,
//     body: UpdateResultBody,
//     actor: Actor
//   ) {
//     const result = await this.getById(organizationId, resultId);
//     if (result.isPublished && !isAdminLike(actor)) {
//       throw new ForbiddenError("Cannot edit a published result");
//     }
//     return prisma.result.update({
//       where: { id: resultId },
//       data: {
//         ...(body.remark !== undefined ? { remark: body.remark } : {}),
//         ...(body.grade !== undefined ? { grade: body.grade } : {}),
//       },
//       include: resultInclude,
//     });
//   }
//   /**
//    * Upsert multiple subject scores onto one student's result for a term.
//    * Creates Result shell if needed. Each subject checked for curriculum + teacher rights.
//    */
//   async upsertScoresForStudent(
//     organizationId: string,
//     studentId: string,
//     termId: string,
//     body: UpsertScoresBody,
//     actor: Actor
//   ) {
//     const student = await assertStudentInOrg(studentId, organizationId);
//     await assertTermInOrg(termId, organizationId);
//     if (!student.classId) {
//       throw new BadRequestError(
//         "Student is not assigned to a class; assign a class before entering scores"
//       );
//     }
//     const classId = student.classId;
//     // Pre-auth each subject
//     for (const item of body.scores) {
//       await assertClassOffersSubject(classId, item.subjectId, organizationId);
//       await assertCanEnterSubjectScores(actor, classId, item.subjectId);
//     }
//     return prisma.$transaction(async (tx) => {
//       let result = await tx.result.findUnique({
//         where: { studentId_termId: { studentId, termId } },
//       });
//       if (result) {
//         await assertCanMutateResultScores(actor, result);
//       } else {
//         result = await tx.result.create({
//           data: {
//             organizationId,
//             studentId,
//             termId,
//             classId,
//             remark: body.remark ?? null,
//           },
//         });
//       }
//       if (body.remark !== undefined && body.remark !== null) {
//         await tx.result.update({
//           where: { id: result.id },
//           data: { remark: body.remark },
//         });
//       }
//       for (const item of body.scores) {
//         const total = computeScoreTotal(item.ca1, item.ca2, item.exam);
//         const grade = gradeFromTotal(total);
//         const remark =
//           item.remark !== undefined
//             ? item.remark
//             : defaultRemarkFromGrade(grade);
//         await tx.score.upsert({
//           where: {
//             resultId_subjectId: {
//               resultId: result.id,
//               subjectId: item.subjectId,
//             },
//           },
//           create: {
//             resultId: result.id,
//             subjectId: item.subjectId,
//             ca1: item.ca1 ?? 0,
//             ca2: item.ca2 ?? 0,
//             exam: item.exam ?? 0,
//             total,
//             grade,
//             remark,
//           },
//           update: {
//             ...(item.ca1 !== undefined ? { ca1: item.ca1 ?? 0 } : {}),
//             ...(item.ca2 !== undefined ? { ca2: item.ca2 ?? 0 } : {}),
//             ...(item.exam !== undefined ? { exam: item.exam ?? 0 } : {}),
//             total,
//             grade,
//             ...(item.remark !== undefined ? { remark: item.remark } : {}),
//           },
//         });
//       }
//       const scores = await tx.score.findMany({
//         where: { resultId: result.id },
//         select: { total: true },
//       });
//       const agg = recomputeResultAggregates(scores);
//       return tx.result.update({
//         where: { id: result.id },
//         data: {
//           totalScore: agg.totalScore,
//           percentage: agg.percentage,
//           grade: agg.grade,
//           classId, // keep denormalized class in sync
//         },
//         include: resultInclude,
//       });
//     });
//   }
//   /** Primary teacher path: one subject, many students */
//   async bulkUpsertSubjectScores(
//     organizationId: string,
//     body: BulkScoresBody,
//     actor: Actor
//   ) {
//     const { classId, termId, subjectId, scores } = body;
//     await assertClassInOrg(classId, organizationId);
//     await assertTermInOrg(termId, organizationId);
//     await assertClassOffersSubject(classId, subjectId, organizationId);
//     await assertCanEnterSubjectScores(actor, classId, subjectId);
//     const studentIds = scores.map((s) => s.studentId);
//     const students = await prisma.student.findMany({
//       where: {
//         organizationId,
//         id: { in: studentIds },
//         classId,
//         isActive: true,
//       },
//       select: { id: true },
//     });
//     if (students.length !== studentIds.length) {
//       throw new BadRequestError(
//         "One or more students are not active members of this class"
//       );
//     }
//     // Block if any target result is published and actor is teacher
//     if (!isAdminLike(actor)) {
//       const published = await prisma.result.findFirst({
//         where: {
//           organizationId,
//           termId,
//           studentId: { in: studentIds },
//           isPublished: true,
//         },
//       });
//       if (published) {
//         throw new ForbiddenError(
//           "Some results in this class are published. Unpublish before editing scores."
//         );
//       }
//     }
//     await prisma.$transaction(async (tx) => {
//       for (const row of scores) {
//         let result = await tx.result.findUnique({
//           where: {
//             studentId_termId: { studentId: row.studentId, termId },
//           },
//         });
//         if (!result) {
//           result = await tx.result.create({
//             data: {
//               organizationId,
//               studentId: row.studentId,
//               termId,
//               classId,
//             },
//           });
//         } else if (result.isPublished && !isAdminLike(actor)) {
//           throw new ForbiddenError("Cannot edit published result");
//         } else if (result.classId !== classId) {
//           await tx.result.update({
//             where: { id: result.id },
//             data: { classId },
//           });
//         }
//         const total = computeScoreTotal(row.ca1, row.ca2, row.exam);
//         const grade = gradeFromTotal(total);
//         const remark =
//           row.remark !== undefined ? row.remark : defaultRemarkFromGrade(grade);
//         await tx.score.upsert({
//           where: {
//             resultId_subjectId: {
//               resultId: result.id,
//               subjectId,
//             },
//           },
//           create: {
//             resultId: result.id,
//             subjectId,
//             ca1: row.ca1 ?? 0,
//             ca2: row.ca2 ?? 0,
//             exam: row.exam ?? 0,
//             total,
//             grade,
//             remark,
//           },
//           update: {
//             ca1: row.ca1 ?? 0,
//             ca2: row.ca2 ?? 0,
//             exam: row.exam ?? 0,
//             total,
//             grade,
//             ...(row.remark !== undefined ? { remark: row.remark } : {}),
//           },
//         });
//         const allScores = await tx.score.findMany({
//           where: { resultId: result.id },
//           select: { total: true },
//         });
//         const agg = recomputeResultAggregates(allScores);
//         await tx.result.update({
//           where: { id: result.id },
//           data: {
//             totalScore: agg.totalScore,
//             percentage: agg.percentage,
//             grade: agg.grade,
//           },
//         });
//       }
//     });
//     return this.getClassSubjectEntrySheet(
//       organizationId,
//       classId,
//       termId,
//       subjectId,
//       actor
//     );
//   }
//   async publish(
//     organizationId: string,
//     body: PublishResultsBody,
//     actor: Actor
//   ) {
//     if (!isAdminLike(actor)) {
//       throw new ForbiddenError(
//         "Only school admin or exam officer can publish results"
//       );
//     }
//     await assertTermInOrg(body.termId, organizationId);
//     if (body.classId) {
//       await assertClassInOrg(body.classId, organizationId);
//     }
//     const where: Prisma.ResultWhereInput = {
//       organizationId,
//       termId: body.termId,
//       ...(body.classId ? { classId: body.classId } : {}),
//     };
//     const data = body.isPublished
//       ? { isPublished: true, publishedAt: new Date() }
//       : { isPublished: false, publishedAt: null };
//     const updated = await prisma.result.updateMany({ where, data });
//     // When publishing a class, refresh positions once
//     if (body.isPublished && body.classId) {
//       await this.recalculatePositions(organizationId, {
//         termId: body.termId,
//         classId: body.classId,
//       });
//     } else if (body.isPublished && !body.classId) {
//       const classes = await prisma.result.findMany({
//         where: { organizationId, termId: body.termId, classId: { not: null } },
//         select: { classId: true },
//         distinct: ["classId"],
//       });
//       for (const c of classes) {
//         if (c.classId) {
//           await this.recalculatePositions(organizationId, {
//             termId: body.termId,
//             classId: c.classId,
//           });
//         }
//       }
//     }
//     return {
//       matched: updated.count,
//       isPublished: body.isPublished,
//       termId: body.termId,
//       classId: body.classId ?? null,
//     };
//   }
//   async recalculatePositions(
//     organizationId: string,
//     body: RecalculatePositionsBody
//   ) {
//     await assertTermInOrg(body.termId, organizationId);
//     await assertClassInOrg(body.classId, organizationId);
//     const results = await prisma.result.findMany({
//       where: {
//         organizationId,
//         termId: body.termId,
//         classId: body.classId,
//       },
//       select: { id: true, percentage: true },
//       orderBy: [{ percentage: "desc" }, { id: "asc" }],
//     });
//     // Dense rank: same % → same position
//     let rank = 0;
//     let lastPct: number | null = null;
//     const updates: { id: string; position: number }[] = [];
//     for (const r of results) {
//       const pct = r.percentage ?? -1;
//       if (lastPct === null || pct !== lastPct) {
//         rank += 1;
//         lastPct = pct;
//       }
//       updates.push({ id: r.id, position: rank });
//     }
//     await prisma.$transaction(
//       updates.map((u) =>
//         prisma.result.update({
//           where: { id: u.id },
//           data: { position: u.position },
//         })
//       )
//     );
//     return {
//       classId: body.classId,
//       termId: body.termId,
//       updated: updates.length,
//     };
//   }
//   async stats(organizationId: string, query: ResultsStatsQuery) {
//     await assertTermInOrg(query.termId, organizationId);
//     if (query.classId) {
//       await assertClassInOrg(query.classId, organizationId);
//     }
//     const base: Prisma.ResultWhereInput = {
//       organizationId,
//       termId: query.termId,
//       ...(query.classId ? { classId: query.classId } : {}),
//     };
//     const [total, published, unpublished, avg] = await Promise.all([
//       prisma.result.count({ where: base }),
//       prisma.result.count({ where: { ...base, isPublished: true } }),
//       prisma.result.count({ where: { ...base, isPublished: false } }),
//       prisma.result.aggregate({
//         where: { ...base, percentage: { not: null } },
//         _avg: { percentage: true, totalScore: true },
//       }),
//     ]);
//     const studentFilter: Prisma.StudentWhereInput = {
//       organizationId,
//       isActive: true,
//       ...(query.classId ? { classId: query.classId } : {}),
//     };
//     const activeStudents = await prisma.student.count({ where: studentFilter });
//     return {
//       termId: query.termId,
//       classId: query.classId ?? null,
//       resultsTotal: total,
//       published,
//       unpublished,
//       activeStudents,
//       missingResults: Math.max(activeStudents - total, 0),
//       averagePercentage: avg._avg.percentage
//         ? Math.round(avg._avg.percentage * 100) / 100
//         : null,
//       averageTotalScore: avg._avg.totalScore
//         ? Math.round(avg._avg.totalScore * 100) / 100
//         : null,
//     };
//   }
//   /**
//    * Parent public verify — admission number + PIN.
//    * Does not require JWT. Rate-limit at gateway / middleware when you wire public routes.
//    */
//   async verifyPublic(body: VerifyResultBody, clientIp?: string) {
//     const org = await prisma.organization.findFirst({
//       where: { slug: body.schoolSlug, isActive: true },
//       select: {
//         id: true,
//         name: true,
//         slug: true,
//         logoUrl: true,
//         motto: true,
//       },
//     });
//     if (!org) throw new NotFoundError("School not found");
//     const student = await prisma.student.findFirst({
//       where: {
//         organizationId: org.id,
//         admissionNumber: body.admissionNumber,
//         isActive: true,
//       },
//     });
//     if (!student) {
//       // Generic message — avoid leaking whether admission exists
//       throw new BadRequestError("Invalid admission number or PIN");
//     }
//     const pin = await prisma.pin.findFirst({
//       where: {
//         organizationId: org.id,
//         code: body.pin,
//       },
//       include: {
//         term: {
//           select: {
//             id: true,
//             name: true,
//             session: { select: { id: true, name: true } },
//           },
//         },
//       },
//     });
//     if (!pin) {
//       throw new BadRequestError("Invalid admission number or PIN");
//     }
//     if (pin.status === PinStatus.DISABLED || pin.status === PinStatus.EXPIRED) {
//       throw new BadRequestError("This PIN is no longer valid");
//     }
//     if (pin.expiresAt && pin.expiresAt < new Date()) {
//       await prisma.pin.update({
//         where: { id: pin.id },
//         data: { status: PinStatus.EXPIRED },
//       });
//       throw new BadRequestError("This PIN has expired");
//     }
//     // Optional pre-assignment: if PIN is bound to a student, must match
//     if (pin.studentId && pin.studentId !== student.id) {
//       throw new BadRequestError("Invalid admission number or PIN");
//     }
//     const result = await prisma.result.findUnique({
//       where: {
//         studentId_termId: { studentId: student.id, termId: pin.termId },
//       },
//       include: resultInclude,
//     });
//     if (!result || !result.isPublished) {
//       throw new BadRequestError(
//         "Result is not available yet. Please check back after the school publishes this term."
//       );
//     }
//     // Consume PIN (idempotent if already USED for same flow)
//     if (pin.status === PinStatus.UNUSED) {
//       await prisma.pin.update({
//         where: { id: pin.id },
//         data: {
//           status: PinStatus.USED,
//           usedAt: new Date(),
//           usedByIp: clientIp ?? null,
//           studentId: pin.studentId ?? student.id,
//         },
//       });
//     }
//     return {
//       school: org,
//       result,
//     };
//   }
// }
// export const resultsService = new ResultsService();
