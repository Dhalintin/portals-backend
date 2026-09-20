"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultsService = exports.ResultsService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma"); // adjust path
const AppError_1 = require("../../common/errors/AppError");
const results_grades_1 = require("./results.grades");
const resultInclude = {
    student: {
        select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            gender: true,
            classId: true,
        },
    },
    term: {
        select: {
            id: true,
            name: true,
            isCurrent: true,
            session: { select: { id: true, name: true, isCurrent: true } },
        },
    },
    class: {
        select: { id: true, name: true, arm: true, level: true },
    },
    scores: {
        include: {
            subject: {
                select: { id: true, name: true, code: true },
            },
        },
        orderBy: { subject: { name: "asc" } },
    },
};
function isAdminLike(actor) {
    return (actor.orgRole === client_1.OrgRole.SCHOOL_ADMIN ||
        actor.orgRole === client_1.OrgRole.EXAM_OFFICER ||
        actor.globalRole === "SUPER_ADMIN");
}
async function assertTermInOrg(termId, organizationId) {
    const term = await prisma_1.prisma.term.findFirst({
        where: {
            id: termId,
            session: { organizationId },
        },
        include: {
            session: { select: { id: true, name: true, organizationId: true } },
        },
    });
    if (!term)
        throw new AppError_1.NotFoundError("Term not found for this school");
    return term;
}
async function assertStudentInOrg(studentId, organizationId) {
    const student = await prisma_1.prisma.student.findFirst({
        where: { id: studentId, organizationId, isActive: true },
    });
    if (!student)
        throw new AppError_1.NotFoundError("Student not found");
    return student;
}
async function assertClassInOrg(classId, organizationId) {
    const cls = await prisma_1.prisma.class.findFirst({
        where: { id: classId, organizationId, isActive: true },
    });
    if (!cls)
        throw new AppError_1.NotFoundError("Class not found");
    return cls;
}
async function assertClassOffersSubject(classId, subjectId, organizationId) {
    const row = await prisma_1.prisma.classSubject.findFirst({
        where: { classId, subjectId, organizationId },
    });
    if (!row) {
        throw new AppError_1.BadRequestError("This subject is not on the class curriculum. Assign it under class subjects first.");
    }
}
/**
 * Score entry: admin/exam officer always; teacher only if ClassSubjectTeacher matches.
 */
async function assertCanEnterSubjectScores(actor, classId, subjectId) {
    if (isAdminLike(actor))
        return;
    const assignment = await prisma_1.prisma.classSubjectTeacher.findFirst({
        where: {
            organizationId: actor.schoolId,
            classId,
            subjectId,
            userId: actor.userId,
        },
    });
    if (!assignment) {
        throw new AppError_1.ForbiddenError("You can only enter scores for subjects you teach in this class");
    }
}
async function assertCanMutateResultScores(actor, result) {
    if (result.organizationId !== actor.schoolId) {
        throw new AppError_1.ForbiddenError("Result does not belong to this school");
    }
    if (result.isPublished && !isAdminLike(actor)) {
        throw new AppError_1.ForbiddenError("This result is published. Ask an exam officer or school admin to unpublish before editing scores.");
    }
}
function recomputeResultAggregates(scores) {
    const totals = scores
        .map((s) => s.total)
        .filter((t) => t != null && !Number.isNaN(t));
    if (totals.length === 0) {
        return { totalScore: 0, percentage: 0, grade: null };
    }
    const totalScore = totals.reduce((a, b) => a + b, 0);
    const percentage = Math.round((totalScore / totals.length) * 100) / 100;
    return {
        totalScore: Math.round(totalScore * 100) / 100,
        percentage,
        grade: (0, results_grades_1.gradeFromTotal)(percentage),
    };
}
async function refreshResultAggregates(resultId) {
    const scores = await prisma_1.prisma.score.findMany({
        where: { resultId },
        select: { total: true },
    });
    const agg = recomputeResultAggregates(scores);
    return prisma_1.prisma.result.update({
        where: { id: resultId },
        data: {
            totalScore: agg.totalScore,
            percentage: agg.percentage,
            grade: agg.grade,
        },
        include: resultInclude,
    });
}
class ResultsService {
    async list(organizationId, query) {
        const { termId, classId, studentId, isPublished, page, limit, search } = query;
        const skip = (page - 1) * limit;
        const where = {
            organizationId,
            ...(termId ? { termId } : {}),
            ...(classId ? { classId } : {}),
            ...(studentId ? { studentId } : {}),
            ...(isPublished !== undefined ? { isPublished } : {}),
            ...(search
                ? {
                    student: {
                        OR: [
                            { firstName: { contains: search, mode: "insensitive" } },
                            { lastName: { contains: search, mode: "insensitive" } },
                            { admissionNumber: { contains: search, mode: "insensitive" } },
                        ],
                    },
                }
                : {}),
        };
        const [items, total] = await Promise.all([
            prisma_1.prisma.result.findMany({
                where,
                include: resultInclude,
                orderBy: [
                    { classId: "asc" },
                    { percentage: "desc" },
                    { createdAt: "desc" },
                ],
                skip,
                take: Number(limit),
            }),
            prisma_1.prisma.result.count({ where }),
        ]);
        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
    async getById(organizationId, id) {
        const result = await prisma_1.prisma.result.findFirst({
            where: { id, organizationId },
            include: resultInclude,
        });
        if (!result)
            throw new AppError_1.NotFoundError("Result not found");
        return result;
    }
    async getByStudentAndTerm(organizationId, studentId, termId) {
        await assertStudentInOrg(studentId, organizationId);
        await assertTermInOrg(termId, organizationId);
        const result = await prisma_1.prisma.result.findUnique({
            where: { studentId_termId: { studentId, termId } },
            include: resultInclude,
        });
        return result; // null is fine — UI shows empty entry state
    }
    /**
     * Entry sheet for a class + term + subject (teacher workflow).
     * Returns every active student in the class with existing score for that subject if any.
     */
    // async getClassSubjectEntrySheet(
    //   organizationId: string,
    //   classId: string,
    //   termId: string,
    //   subjectId: string,
    //   actor: Actor
    // ) {
    //   await assertClassInOrg(classId, organizationId);
    //   await assertTermInOrg(termId, organizationId);
    //   await assertClassOffersSubject(classId, subjectId, organizationId);
    //   await assertCanEnterSubjectScores(actor, classId, subjectId);
    //   const subject = await prisma.subject.findFirst({
    //     where: { id: subjectId, organizationId, isActive: true },
    //     select: { id: true, name: true, code: true },
    //   });
    //   if (!subject) throw new NotFoundError("Subject not found");
    //   const students = await prisma.student.findMany({
    //     where: { organizationId, classId, isActive: true },
    //     select: {
    //       id: true,
    //       admissionNumber: true,
    //       firstName: true,
    //       lastName: true,
    //       otherNames: true,
    //     },
    //     orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    //   });
    //   const results = await prisma.result.findMany({
    //     where: {
    //       organizationId,
    //       termId,
    //       studentId: { in: students.map((s) => s.id) },
    //     },
    //     select: {
    //       id: true,
    //       studentId: true,
    //       isPublished: true,
    //       scores: {
    //         where: { subjectId },
    //         select: {
    //           id: true,
    //           ca1: true,
    //           ca2: true,
    //           exam: true,
    //           total: true,
    //           grade: true,
    //           remark: true,
    //         },
    //       },
    //     },
    //   });
    //   const byStudent = new Map(results.map((r) => [r.studentId, r]));
    //   return {
    //     classId,
    //     termId,
    //     subject,
    //     isClassPublished: results.some((r) => r.isPublished),
    //     rows: students.map((student) => {
    //       const res = byStudent.get(student.id);
    //       const score = res?.scores[0] ?? null;
    //       return {
    //         student,
    //         resultId: res?.id ?? null,
    //         isPublished: res?.isPublished ?? false,
    //         score,
    //       };
    //     }),
    //   };
    // }
    /**
     * Class × term × subject score sheet.
     * Ensures every active student in the class has a Result for the term
     * and a Score for this subject (defaults ca1/ca2/exam = 0).
     */
    async getClassSubjectEntrySheet(organizationId, classId, termId, subjectId, actor) {
        await assertClassInOrg(classId, organizationId);
        await assertTermInOrg(termId, organizationId);
        await assertClassOffersSubject(classId, subjectId, organizationId);
        await assertCanEnterSubjectScores(actor, classId, subjectId);
        const subject = await prisma_1.prisma.subject.findFirst({
            where: { id: subjectId, organizationId, isActive: true },
            select: { id: true, name: true, code: true },
        });
        if (!subject)
            throw new AppError_1.NotFoundError("Subject not found");
        const students = await prisma_1.prisma.student.findMany({
            where: { organizationId, classId, isActive: true },
            select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
                otherNames: true,
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
        // Seed Result + Score (0s) for anyone missing them
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const student of students) {
                let result = await tx.result.findUnique({
                    where: {
                        studentId_termId: { studentId: student.id, termId },
                    },
                });
                if (!result) {
                    result = await tx.result.create({
                        data: {
                            organizationId,
                            studentId: student.id,
                            termId,
                            classId,
                            totalScore: 0,
                            percentage: 0,
                            grade: (0, results_grades_1.gradeFromTotal)(0),
                        },
                    });
                }
                else if (result.classId !== classId) {
                    await tx.result.update({
                        where: { id: result.id },
                        data: { classId },
                    });
                }
                const existingScore = await tx.score.findUnique({
                    where: {
                        resultId_subjectId: {
                            resultId: result.id,
                            subjectId,
                        },
                    },
                });
                if (!existingScore) {
                    const total = 0;
                    await tx.score.create({
                        data: {
                            resultId: result.id,
                            subjectId,
                            ca1: 0,
                            ca2: 0,
                            exam: 0,
                            total,
                            grade: (0, results_grades_1.gradeFromTotal)(total),
                            remark: (0, results_grades_1.defaultRemarkFromGrade)((0, results_grades_1.gradeFromTotal)(total)),
                        },
                    });
                    // Keep aggregates in sync if this was the first score
                    const allScores = await tx.score.findMany({
                        where: { resultId: result.id },
                        select: { total: true },
                    });
                    const agg = recomputeResultAggregates(allScores);
                    await tx.result.update({
                        where: { id: result.id },
                        data: {
                            totalScore: agg.totalScore,
                            percentage: agg.percentage,
                            grade: agg.grade,
                        },
                    });
                }
            }
        });
        const results = await prisma_1.prisma.result.findMany({
            where: {
                organizationId,
                termId,
                studentId: { in: students.map((s) => s.id) },
            },
            select: {
                id: true,
                studentId: true,
                isPublished: true,
                scores: {
                    where: { subjectId },
                    select: {
                        id: true,
                        ca1: true,
                        ca2: true,
                        exam: true,
                        total: true,
                        grade: true,
                        remark: true,
                    },
                },
            },
        });
        const byStudent = new Map(results.map((r) => [r.studentId, r]));
        return {
            classId,
            termId,
            subject,
            isClassPublished: results.some((r) => r.isPublished),
            rows: students.map((student) => {
                const res = byStudent.get(student.id);
                const score = res?.scores[0] ?? null;
                return {
                    student,
                    resultId: res?.id ?? null,
                    isPublished: res?.isPublished ?? false,
                    score: score
                        ? {
                            id: score.id,
                            ca1: score.ca1 ?? 0,
                            ca2: score.ca2 ?? 0,
                            exam: score.exam ?? 0,
                            total: score.total ?? 0,
                            grade: score.grade,
                            remark: score.remark,
                        }
                        : {
                            id: "",
                            ca1: 0,
                            ca2: 0,
                            exam: 0,
                            total: 0,
                            grade: (0, results_grades_1.gradeFromTotal)(0),
                            remark: null,
                        },
                };
            }),
        };
    }
    async updateResultMeta(organizationId, resultId, body, actor) {
        const result = await this.getById(organizationId, resultId);
        if (result.isPublished && !isAdminLike(actor)) {
            throw new AppError_1.ForbiddenError("Cannot edit a published result");
        }
        return prisma_1.prisma.result.update({
            where: { id: resultId },
            data: {
                ...(body.remark !== undefined ? { remark: body.remark } : {}),
                ...(body.grade !== undefined ? { grade: body.grade } : {}),
            },
            include: resultInclude,
        });
    }
    /**
     * Upsert multiple subject scores onto one student's result for a term.
     * Creates Result shell if needed. Each subject checked for curriculum + teacher rights.
     */
    async upsertScoresForStudent(organizationId, studentId, termId, body, actor) {
        const student = await assertStudentInOrg(studentId, organizationId);
        await assertTermInOrg(termId, organizationId);
        if (!student.classId) {
            throw new AppError_1.BadRequestError("Student is not assigned to a class; assign a class before entering scores");
        }
        const classId = student.classId;
        // Pre-auth each subject
        for (const item of body.scores) {
            await assertClassOffersSubject(classId, item.subjectId, organizationId);
            await assertCanEnterSubjectScores(actor, classId, item.subjectId);
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            let result = await tx.result.findUnique({
                where: { studentId_termId: { studentId, termId } },
            });
            if (result) {
                await assertCanMutateResultScores(actor, result);
            }
            else {
                result = await tx.result.create({
                    data: {
                        organizationId,
                        studentId,
                        termId,
                        classId,
                        remark: body.remark ?? null,
                    },
                });
            }
            if (body.remark !== undefined && body.remark !== null) {
                await tx.result.update({
                    where: { id: result.id },
                    data: { remark: body.remark },
                });
            }
            for (const item of body.scores) {
                const total = (0, results_grades_1.computeScoreTotal)(item.ca1, item.ca2, item.exam);
                const grade = (0, results_grades_1.gradeFromTotal)(total);
                const remark = item.remark !== undefined
                    ? item.remark
                    : (0, results_grades_1.defaultRemarkFromGrade)(grade);
                await tx.score.upsert({
                    where: {
                        resultId_subjectId: {
                            resultId: result.id,
                            subjectId: item.subjectId,
                        },
                    },
                    create: {
                        resultId: result.id,
                        subjectId: item.subjectId,
                        ca1: item.ca1 ?? 0,
                        ca2: item.ca2 ?? 0,
                        exam: item.exam ?? 0,
                        total,
                        grade,
                        remark,
                    },
                    update: {
                        ...(item.ca1 !== undefined ? { ca1: item.ca1 ?? 0 } : {}),
                        ...(item.ca2 !== undefined ? { ca2: item.ca2 ?? 0 } : {}),
                        ...(item.exam !== undefined ? { exam: item.exam ?? 0 } : {}),
                        total,
                        grade,
                        ...(item.remark !== undefined ? { remark: item.remark } : {}),
                    },
                });
            }
            const scores = await tx.score.findMany({
                where: { resultId: result.id },
                select: { total: true },
            });
            const agg = recomputeResultAggregates(scores);
            return tx.result.update({
                where: { id: result.id },
                data: {
                    totalScore: agg.totalScore,
                    percentage: agg.percentage,
                    grade: agg.grade,
                    classId, // keep denormalized class in sync
                },
                include: resultInclude,
            });
        });
    }
    /** Primary teacher path: one subject, many students */
    async bulkUpsertSubjectScores(organizationId, body, actor) {
        const { classId, termId, subjectId, scores } = body;
        await assertClassInOrg(classId, organizationId);
        await assertTermInOrg(termId, organizationId);
        await assertClassOffersSubject(classId, subjectId, organizationId);
        await assertCanEnterSubjectScores(actor, classId, subjectId);
        const studentIds = scores.map((s) => s.studentId);
        const students = await prisma_1.prisma.student.findMany({
            where: {
                organizationId,
                id: { in: studentIds },
                classId,
                isActive: true,
            },
            select: { id: true },
        });
        if (students.length !== studentIds.length) {
            throw new AppError_1.BadRequestError("One or more students are not active members of this class");
        }
        // Block if any target result is published and actor is teacher
        if (!isAdminLike(actor)) {
            const published = await prisma_1.prisma.result.findFirst({
                where: {
                    organizationId,
                    termId,
                    studentId: { in: studentIds },
                    isPublished: true,
                },
            });
            if (published) {
                throw new AppError_1.ForbiddenError("Some results in this class are published. Unpublish before editing scores.");
            }
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const row of scores) {
                let result = await tx.result.findUnique({
                    where: {
                        studentId_termId: { studentId: row.studentId, termId },
                    },
                });
                if (!result) {
                    result = await tx.result.create({
                        data: {
                            organizationId,
                            studentId: row.studentId,
                            termId,
                            classId,
                        },
                    });
                }
                else if (result.isPublished && !isAdminLike(actor)) {
                    throw new AppError_1.ForbiddenError("Cannot edit published result");
                }
                else if (result.classId !== classId) {
                    await tx.result.update({
                        where: { id: result.id },
                        data: { classId },
                    });
                }
                const total = (0, results_grades_1.computeScoreTotal)(row.ca1, row.ca2, row.exam);
                const grade = (0, results_grades_1.gradeFromTotal)(total);
                const remark = row.remark !== undefined ? row.remark : (0, results_grades_1.defaultRemarkFromGrade)(grade);
                await tx.score.upsert({
                    where: {
                        resultId_subjectId: {
                            resultId: result.id,
                            subjectId,
                        },
                    },
                    create: {
                        resultId: result.id,
                        subjectId,
                        ca1: row.ca1 ?? 0,
                        ca2: row.ca2 ?? 0,
                        exam: row.exam ?? 0,
                        total,
                        grade,
                        remark,
                    },
                    update: {
                        ca1: row.ca1 ?? 0,
                        ca2: row.ca2 ?? 0,
                        exam: row.exam ?? 0,
                        total,
                        grade,
                        ...(row.remark !== undefined ? { remark: row.remark } : {}),
                    },
                });
                const allScores = await tx.score.findMany({
                    where: { resultId: result.id },
                    select: { total: true },
                });
                const agg = recomputeResultAggregates(allScores);
                await tx.result.update({
                    where: { id: result.id },
                    data: {
                        totalScore: agg.totalScore,
                        percentage: agg.percentage,
                        grade: agg.grade,
                    },
                });
            }
        });
        return this.getClassSubjectEntrySheet(organizationId, classId, termId, subjectId, actor);
    }
    async publish(organizationId, body, actor) {
        if (!isAdminLike(actor)) {
            throw new AppError_1.ForbiddenError("Only school admin or exam officer can publish results");
        }
        await assertTermInOrg(body.termId, organizationId);
        if (body.classId) {
            await assertClassInOrg(body.classId, organizationId);
        }
        const where = {
            organizationId,
            termId: body.termId,
            ...(body.classId ? { classId: body.classId } : {}),
        };
        const data = body.isPublished
            ? { isPublished: true, publishedAt: new Date() }
            : { isPublished: false, publishedAt: null };
        const updated = await prisma_1.prisma.result.updateMany({ where, data });
        // When publishing a class, refresh positions once
        if (body.isPublished && body.classId) {
            await this.recalculatePositions(organizationId, {
                termId: body.termId,
                classId: body.classId,
            });
        }
        else if (body.isPublished && !body.classId) {
            const classes = await prisma_1.prisma.result.findMany({
                where: { organizationId, termId: body.termId, classId: { not: null } },
                select: { classId: true },
                distinct: ["classId"],
            });
            for (const c of classes) {
                if (c.classId) {
                    await this.recalculatePositions(organizationId, {
                        termId: body.termId,
                        classId: c.classId,
                    });
                }
            }
        }
        return {
            matched: updated.count,
            isPublished: body.isPublished,
            termId: body.termId,
            classId: body.classId ?? null,
        };
    }
    async recalculatePositions(organizationId, body) {
        await assertTermInOrg(body.termId, organizationId);
        await assertClassInOrg(body.classId, organizationId);
        const results = await prisma_1.prisma.result.findMany({
            where: {
                organizationId,
                termId: body.termId,
                classId: body.classId,
            },
            select: { id: true, percentage: true },
            orderBy: [{ percentage: "desc" }, { id: "asc" }],
        });
        // Dense rank: same % → same position
        let rank = 0;
        let lastPct = null;
        const updates = [];
        for (const r of results) {
            const pct = r.percentage ?? -1;
            if (lastPct === null || pct !== lastPct) {
                rank += 1;
                lastPct = pct;
            }
            updates.push({ id: r.id, position: rank });
        }
        await prisma_1.prisma.$transaction(updates.map((u) => prisma_1.prisma.result.update({
            where: { id: u.id },
            data: { position: u.position },
        })));
        return {
            classId: body.classId,
            termId: body.termId,
            updated: updates.length,
        };
    }
    async stats(organizationId, query) {
        await assertTermInOrg(query.termId, organizationId);
        if (query.classId) {
            await assertClassInOrg(query.classId, organizationId);
        }
        const base = {
            organizationId,
            termId: query.termId,
            ...(query.classId ? { classId: query.classId } : {}),
        };
        const [total, published, unpublished, avg] = await Promise.all([
            prisma_1.prisma.result.count({ where: base }),
            prisma_1.prisma.result.count({ where: { ...base, isPublished: true } }),
            prisma_1.prisma.result.count({ where: { ...base, isPublished: false } }),
            prisma_1.prisma.result.aggregate({
                where: { ...base, percentage: { not: null } },
                _avg: { percentage: true, totalScore: true },
            }),
        ]);
        const studentFilter = {
            organizationId,
            isActive: true,
            ...(query.classId ? { classId: query.classId } : {}),
        };
        const activeStudents = await prisma_1.prisma.student.count({ where: studentFilter });
        return {
            termId: query.termId,
            classId: query.classId ?? null,
            resultsTotal: total,
            published,
            unpublished,
            activeStudents,
            missingResults: Math.max(activeStudents - total, 0),
            averagePercentage: avg._avg.percentage
                ? Math.round(avg._avg.percentage * 100) / 100
                : null,
            averageTotalScore: avg._avg.totalScore
                ? Math.round(avg._avg.totalScore * 100) / 100
                : null,
        };
    }
    /**
     * Parent public verify — admission number + PIN.
     * Does not require JWT. Rate-limit at gateway / middleware when you wire public routes.
     */
    async verifyPublic(body, clientIp) {
        const org = await prisma_1.prisma.organization.findFirst({
            where: { slug: body.schoolSlug, isActive: true },
            select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                motto: true,
            },
        });
        if (!org)
            throw new AppError_1.NotFoundError("School not found");
        const student = await prisma_1.prisma.student.findFirst({
            where: {
                organizationId: org.id,
                admissionNumber: body.admissionNumber,
                isActive: true,
            },
        });
        if (!student) {
            // Generic message — avoid leaking whether admission exists
            throw new AppError_1.BadRequestError("Invalid admission number or PIN");
        }
        const pin = await prisma_1.prisma.pin.findFirst({
            where: {
                organizationId: org.id,
                code: body.pin,
            },
            include: {
                term: {
                    select: {
                        id: true,
                        name: true,
                        session: { select: { id: true, name: true } },
                    },
                },
            },
        });
        if (!pin) {
            throw new AppError_1.BadRequestError("Invalid admission number or PIN");
        }
        if (pin.status === client_1.PinStatus.DISABLED || pin.status === client_1.PinStatus.EXPIRED) {
            throw new AppError_1.BadRequestError("This PIN is no longer valid");
        }
        if (pin.expiresAt && pin.expiresAt < new Date()) {
            await prisma_1.prisma.pin.update({
                where: { id: pin.id },
                data: { status: client_1.PinStatus.EXPIRED },
            });
            throw new AppError_1.BadRequestError("This PIN has expired");
        }
        // Optional pre-assignment: if PIN is bound to a student, must match
        if (pin.studentId && pin.studentId !== student.id) {
            throw new AppError_1.BadRequestError("Invalid admission number or PIN");
        }
        const result = await prisma_1.prisma.result.findUnique({
            where: {
                studentId_termId: { studentId: student.id, termId: pin.termId },
            },
            include: resultInclude,
        });
        if (!result || !result.isPublished) {
            throw new AppError_1.BadRequestError("Result is not available yet. Please check back after the school publishes this term.");
        }
        // Consume PIN (idempotent if already USED for same flow)
        if (pin.status === client_1.PinStatus.UNUSED) {
            await prisma_1.prisma.pin.update({
                where: { id: pin.id },
                data: {
                    status: client_1.PinStatus.USED,
                    usedAt: new Date(),
                    usedByIp: clientIp ?? null,
                    studentId: pin.studentId ?? student.id,
                },
            });
        }
        return {
            school: org,
            result,
        };
    }
}
exports.ResultsService = ResultsService;
exports.resultsService = new ResultsService();
