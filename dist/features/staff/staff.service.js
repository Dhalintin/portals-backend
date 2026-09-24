"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffService = exports.StaffService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function assertStaff(actor) {
    const ok = actor.orgRole === client_1.OrgRole.TEACHER ||
        actor.orgRole === client_1.OrgRole.EXAM_OFFICER ||
        actor.orgRole === client_1.OrgRole.SCHOOL_ADMIN;
    if (!ok)
        throw new AppError_1.ForbiddenError("Staff access only");
}
function isExamOrAdmin(actor) {
    return (actor.orgRole === client_1.OrgRole.EXAM_OFFICER ||
        actor.orgRole === client_1.OrgRole.SCHOOL_ADMIN);
}
/** Grade helper — replace with your shared module */
function computeTotal(ca1, ca2, exam) {
    return (ca1 ?? 0) + (ca2 ?? 0) + (exam ?? 0);
}
function gradeFromTotal(total) {
    if (total >= 70)
        return "A";
    if (total >= 60)
        return "B";
    if (total >= 50)
        return "C";
    if (total >= 40)
        return "D";
    return "F";
}
class StaffService {
    // ─── Me / dashboard ──────────────────────────────────────────────────────
    async getMyDashboard(actor) {
        assertStaff(actor);
        const { userId, organizationId } = actor;
        const [subjectAssignments, formClasses, me] = await Promise.all([
            prisma_1.prisma.classSubjectTeacher.findMany({
                where: { userId, organizationId },
                select: {
                    id: true,
                    classId: true,
                    subjectId: true,
                    class: {
                        select: {
                            id: true,
                            name: true,
                            arm: true,
                            level: true,
                            isActive: true,
                        },
                    },
                    subject: {
                        select: { id: true, name: true, code: true, isActive: true },
                    },
                },
                orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
            }),
            prisma_1.prisma.class.findMany({
                where: {
                    organizationId,
                    classTeacherId: userId,
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    arm: true,
                    level: true,
                    _count: { select: { students: true } },
                },
                orderBy: { name: "asc" },
            }),
            prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            }),
        ]);
        return {
            me,
            role: actor.orgRole,
            subjectAssignments: subjectAssignments.map((a) => ({
                id: a.id,
                classId: a.classId,
                subjectId: a.subjectId,
                class: {
                    ...a.class,
                    label: a.class.arm ? `${a.class.name} ${a.class.arm}` : a.class.name,
                },
                subject: a.subject,
            })),
            formTeacherOf: formClasses.map((c) => ({
                id: c.id,
                name: c.name,
                arm: c.arm,
                level: c.level,
                label: c.arm ? `${c.name} ${c.arm}` : c.name,
                studentCount: c._count.students,
            })),
            counts: {
                subjectsTeaching: subjectAssignments.length,
                formClasses: formClasses.length,
            },
        };
    }
    // ─── Assignments ─────────────────────────────────────────────────────────
    async listMyAssignments(actor) {
        assertStaff(actor);
        const rows = await prisma_1.prisma.classSubjectTeacher.findMany({
            where: {
                userId: actor.userId,
                organizationId: actor.organizationId,
            },
            select: {
                id: true,
                classId: true,
                subjectId: true,
                class: {
                    select: {
                        id: true,
                        name: true,
                        arm: true,
                        level: true,
                        isActive: true,
                    },
                },
                subject: {
                    select: { id: true, name: true, code: true, isActive: true },
                },
            },
            orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
        });
        return {
            items: rows.map((a) => ({
                id: a.id,
                classId: a.classId,
                subjectId: a.subjectId,
                classLabel: a.class.arm
                    ? `${a.class.name} ${a.class.arm}`
                    : a.class.name,
                class: a.class,
                subject: a.subject,
            })),
        };
    }
    /** True if this teacher may enter scores for class+subject */
    async assertCanEnterScores(actor, classId, subjectId) {
        if (isExamOrAdmin(actor)) {
            // Exam officer / admin: subject must still be on class curriculum
            const cs = await prisma_1.prisma.classSubject.findFirst({
                where: {
                    organizationId: actor.organizationId,
                    classId,
                    subjectId,
                },
                select: { id: true },
            });
            if (!cs) {
                throw new AppError_1.ForbiddenError("Subject is not on this class curriculum");
            }
            return;
        }
        const assignment = await prisma_1.prisma.classSubjectTeacher.findFirst({
            where: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                classId,
                subjectId,
            },
            select: { id: true },
        });
        if (!assignment) {
            throw new AppError_1.ForbiddenError("You are not assigned to teach this subject in this class");
        }
    }
    async assertCanViewClass(actor, classId) {
        if (isExamOrAdmin(actor))
            return;
        const cls = await prisma_1.prisma.class.findFirst({
            where: {
                id: classId,
                organizationId: actor.organizationId,
            },
            select: { classTeacherId: true },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        if (cls.classTeacherId === actor.userId)
            return;
        const teaches = await prisma_1.prisma.classSubjectTeacher.findFirst({
            where: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                classId,
            },
            select: { id: true },
        });
        if (!teaches) {
            throw new AppError_1.ForbiddenError("You do not teach in this class");
        }
    }
    // ─── Form teacher / class view ───────────────────────────────────────────
    async getClassDetail(actor, classId) {
        assertStaff(actor);
        await this.assertCanViewClass(actor, classId);
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId: actor.organizationId },
            select: {
                id: true,
                name: true,
                arm: true,
                level: true,
                isActive: true,
                classTeacherId: true,
                classTeacher: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                subjects: {
                    select: {
                        subject: {
                            select: { id: true, name: true, code: true, isActive: true },
                        },
                    },
                },
                subjectTeachers: {
                    select: {
                        subjectId: true,
                        user: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                    },
                },
                _count: { select: { students: true } },
            },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        const mySubjects = await prisma_1.prisma.classSubjectTeacher.findMany({
            where: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                classId,
            },
            select: { subjectId: true },
        });
        const mySubjectIds = new Set(mySubjects.map((m) => m.subjectId));
        return {
            id: cls.id,
            name: cls.name,
            arm: cls.arm,
            level: cls.level,
            label: cls.arm ? `${cls.name} ${cls.arm}` : cls.name,
            isActive: cls.isActive,
            studentCount: cls._count.students,
            isFormTeacher: cls.classTeacherId === actor.userId,
            classTeacher: cls.classTeacher,
            subjects: cls.subjects.map((s) => ({
                ...s.subject,
                teacher: cls.subjectTeachers.find((t) => t.subjectId === s.subject.id)
                    ?.user,
                iTeach: mySubjectIds.has(s.subject.id),
            })),
        };
    }
    async getClassRoster(actor, classId) {
        assertStaff(actor);
        await this.assertCanViewClass(actor, classId);
        const students = await prisma_1.prisma.student.findMany({
            where: {
                organizationId: actor.organizationId,
                classId,
                isActive: true,
            },
            select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                gender: true,
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
        return { classId, items: students };
    }
    // ─── Score entry ─────────────────────────────────────────────────────────
    /**
     * Entry sheet: ensures Result + Score shells (0) exist for each student,
     * same idea as admin results entry sheet.
     */
    async getEntrySheet(actor, query) {
        assertStaff(actor);
        const { termId, classId, subjectId } = query;
        const { organizationId } = actor;
        await this.assertCanEnterScores(actor, classId, subjectId);
        const [term, cls, subject, students] = await Promise.all([
            prisma_1.prisma.term.findFirst({
                where: {
                    id: termId,
                    session: { organizationId },
                },
                select: {
                    id: true,
                    name: true,
                    session: { select: { name: true } },
                },
            }),
            prisma_1.prisma.class.findFirst({
                where: { id: classId, organizationId },
                select: { id: true, name: true, arm: true },
            }),
            prisma_1.prisma.subject.findFirst({
                where: { id: subjectId, organizationId },
                select: { id: true, name: true, code: true },
            }),
            prisma_1.prisma.student.findMany({
                where: { organizationId, classId, isActive: true },
                select: {
                    id: true,
                    admissionNumber: true,
                    firstName: true,
                    lastName: true,
                },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            }),
        ]);
        if (!term)
            throw new AppError_1.NotFoundError("Term not found");
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        if (!subject)
            throw new AppError_1.NotFoundError("Subject not found");
        // Seed missing Result + Score in one transaction
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const st of students) {
                let result = await tx.result.findUnique({
                    where: {
                        studentId_termId: { studentId: st.id, termId },
                    },
                });
                if (!result) {
                    result = await tx.result.create({
                        data: {
                            organizationId,
                            studentId: st.id,
                            termId,
                            classId,
                            isPublished: false,
                        },
                    });
                }
                const existing = await tx.score.findUnique({
                    where: {
                        resultId_subjectId: {
                            resultId: result.id,
                            subjectId,
                        },
                    },
                });
                if (!existing) {
                    await tx.score.create({
                        data: {
                            resultId: result.id,
                            subjectId,
                            ca1: 0,
                            ca2: 0,
                            exam: 0,
                            total: 0,
                            grade: gradeFromTotal(0),
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
        const isClassPublished = results.some((r) => r.isPublished);
        // Teachers cannot edit if any result published (stricter); exam/admin may still — mirror admin policy
        const canEdit = isExamOrAdmin(actor) || !isClassPublished;
        return {
            term: {
                id: term.id,
                name: term.name,
                sessionName: term.session.name,
            },
            class: {
                id: cls.id,
                label: cls.arm ? `${cls.name} ${cls.arm}` : cls.name,
            },
            subject,
            isClassPublished,
            canEdit,
            rows: students.map((st) => {
                const result = byStudent.get(st.id);
                const score = result?.scores[0] ?? null;
                return {
                    student: st,
                    resultId: result?.id ?? null,
                    isPublished: result?.isPublished ?? false,
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
                            id: null,
                            ca1: 0,
                            ca2: 0,
                            exam: 0,
                            total: 0,
                            grade: "F",
                            remark: null,
                        },
                };
            }),
        };
    }
    async bulkUpsertScores(actor, body) {
        assertStaff(actor);
        const { termId, classId, subjectId, scores } = body;
        const { organizationId } = actor;
        await this.assertCanEnterScores(actor, classId, subjectId);
        // Block teachers when published
        if (!isExamOrAdmin(actor)) {
            const published = await prisma_1.prisma.result.count({
                where: {
                    organizationId,
                    termId,
                    classId,
                    isPublished: true,
                    studentId: { in: scores.map((s) => s.studentId) },
                },
            });
            if (published > 0) {
                throw new AppError_1.ForbiddenError("Some results are published. Ask exam officer or admin to edit.");
            }
        }
        // Validate students belong to class
        const validStudents = await prisma_1.prisma.student.findMany({
            where: {
                organizationId,
                classId,
                id: { in: scores.map((s) => s.studentId) },
                isActive: true,
            },
            select: { id: true },
        });
        const validIds = new Set(validStudents.map((s) => s.id));
        for (const row of scores) {
            if (!validIds.has(row.studentId)) {
                throw new AppError_1.BadRequestError(`Student ${row.studentId} is not in this class`);
            }
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const row of scores) {
                let result = await tx.result.findUnique({
                    where: {
                        studentId_termId: {
                            studentId: row.studentId,
                            termId,
                        },
                    },
                });
                if (!result) {
                    result = await tx.result.create({
                        data: {
                            organizationId,
                            studentId: row.studentId,
                            termId,
                            classId,
                            isPublished: false,
                        },
                    });
                }
                const ca1 = row.ca1 ?? 0;
                const ca2 = row.ca2 ?? 0;
                const exam = row.exam ?? 0;
                const total = computeTotal(ca1, ca2, exam);
                const grade = gradeFromTotal(total);
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
                        ca1,
                        ca2,
                        exam,
                        total,
                        grade,
                        remark: row.remark ?? null,
                    },
                    update: {
                        ca1,
                        ca2,
                        exam,
                        total,
                        grade,
                        remark: row.remark ?? null,
                    },
                });
                // Optional: recompute result aggregates from all scores
                const allScores = await tx.score.findMany({
                    where: { resultId: result.id },
                    select: { total: true },
                });
                const sum = allScores.reduce((a, s) => a + (s.total ?? 0), 0);
                const percentage = allScores.length > 0 ? sum / allScores.length : null;
                await tx.result.update({
                    where: { id: result.id },
                    data: {
                        totalScore: sum,
                        percentage,
                        grade: percentage != null ? gradeFromTotal(percentage) : null,
                        classId,
                    },
                });
            }
        });
        // Return refreshed sheet
        return this.getEntrySheet(actor, { termId, classId, subjectId });
    }
    /** Subject progress for one of my assignments */
    async getAssignmentProgress(actor, query) {
        assertStaff(actor);
        await this.assertCanEnterScores(actor, query.classId, query.subjectId);
        const students = await prisma_1.prisma.student.count({
            where: {
                organizationId: actor.organizationId,
                classId: query.classId,
                isActive: true,
            },
        });
        const withScore = await prisma_1.prisma.score.count({
            where: {
                subjectId: query.subjectId,
                result: {
                    organizationId: actor.organizationId,
                    termId: query.termId,
                    classId: query.classId,
                },
                OR: [{ ca1: { gt: 0 } }, { ca2: { gt: 0 } }, { exam: { gt: 0 } }],
            },
        });
        return {
            studentCount: students,
            enteredCount: withScore,
            pendingCount: Math.max(0, students - withScore),
        };
    }
}
exports.StaffService = StaffService;
exports.staffService = new StaffService();
