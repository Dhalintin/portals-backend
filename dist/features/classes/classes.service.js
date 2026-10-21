"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classesService = exports.ClassesService = void 0;
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const staffing_1 = require("../../lib/staffing");
const errors_1 = require("../../lib/errors");
const classInclude = {
    classTeacher: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    },
    _count: { select: { students: true } },
};
class ClassesService {
    db;
    constructor(db = prisma_1.prisma) {
        this.db = db;
    }
    async clearSubjectTeacher(organizationId, classId, subjectId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const cls = await tx.class.findFirst({ where: { id: classId, organizationId } });
            const subject = await tx.subject.findFirst({ where: { id: subjectId, organizationId } });
            if (!cls || !subject)
                throw new errors_1.AppError(404, "NOT_FOUND", "Class or subject not found");
            await tx.classSubjectTeacher.deleteMany({ where: { organizationId, classId, subjectId } });
            return { ok: true };
        });
    }
    async list(organizationId, query) {
        const where = {
            organizationId,
            ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
            ...(query.q
                ? {
                    OR: [
                        { name: { contains: query.q, mode: "insensitive" } },
                        { arm: { contains: query.q, mode: "insensitive" } },
                        { level: { contains: query.q, mode: "insensitive" } },
                    ],
                }
                : {}),
        };
        const skip = (query.page - 1) * query.limit;
        const [rows, total] = await Promise.all([
            this.db.class.findMany({
                where,
                include: classInclude,
                orderBy: [{ name: "asc" }, { arm: "asc" }],
                skip,
                take: query.limit,
            }),
            this.db.class.count({ where }),
        ]);
        return {
            items: rows.map((c) => ({
                id: c.id,
                name: c.name,
                arm: c.arm,
                level: c.level,
                isActive: c.isActive,
                classTeacher: c.classTeacher,
                studentCount: c._count.students,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            })),
            meta: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit) || 1,
            },
        };
    }
    async get(organizationId, classId) {
        const row = await this.db.class.findFirst({
            where: { id: classId, organizationId },
            include: {
                ...classInclude,
                subjects: {
                    include: {
                        subject: {
                            select: { id: true, name: true, code: true, isActive: true },
                        },
                    },
                },
                subjectTeachers: {
                    include: {
                        subject: { select: { id: true, name: true, code: true } },
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        if (!row) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Class not found");
        }
        return {
            id: row.id,
            name: row.name,
            arm: row.arm,
            level: row.level,
            isActive: row.isActive,
            classTeacher: row.classTeacher,
            studentCount: row._count.students,
            subjects: row.subjects.map((cs) => cs.subject),
            subjectTeachers: row.subjectTeachers.map((st) => ({
                subjectId: st.subjectId,
                subject: st.subject,
                teacher: st.user,
            })),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
    async create(organizationId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).createLocked(organizationId, input));
    }
    async createLocked(organizationId, input) {
        if (input.isActive === false && input.classTeacherId)
            throw new errors_1.AppError(400, "INACTIVE_CLASS", "An inactive class cannot have a class teacher");
        if (input.classTeacherId) {
            await this.assertTeacherMembership(organizationId, input.classTeacherId);
            await this.assertTeacherFree(organizationId, input.classTeacherId, null);
        }
        try {
            return await this.db.class.create({
                data: {
                    organizationId,
                    name: input.name,
                    arm: input.arm ?? null,
                    level: input.level ?? null,
                    isActive: input.isActive ?? true,
                    classTeacherId: input.classTeacherId ?? null,
                },
                include: classInclude,
            });
        }
        catch {
            throw new errors_1.AppError(409, "CLASS_EXISTS", "A class with this name and arm already exists");
        }
    }
    async update(organizationId, classId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).updateLocked(organizationId, classId, input));
    }
    async updateLocked(organizationId, classId, input) {
        const cls = await this.requireClass(organizationId, classId);
        if (input.classTeacherId && !(input.isActive ?? cls.isActive))
            throw new errors_1.AppError(400, "INACTIVE_CLASS", "An inactive class cannot have a class teacher");
        if (input.isActive === false)
            await this.db.classSubjectTeacher.deleteMany({ where: { organizationId, classId } });
        if (input.classTeacherId) {
            await this.assertTeacherMembership(organizationId, input.classTeacherId);
            await this.assertTeacherFree(organizationId, input.classTeacherId, classId);
        }
        try {
            return await this.db.class.update({
                where: { id: classId },
                data: {
                    name: input.name,
                    arm: input.arm === undefined ? undefined : input.arm,
                    level: input.level === undefined ? undefined : input.level,
                    isActive: input.isActive,
                    classTeacherId: input.isActive === false ? null : input.classTeacherId === undefined
                        ? undefined
                        : input.classTeacherId,
                },
                include: classInclude,
            });
        }
        catch {
            throw new errors_1.AppError(409, "CLASS_EXISTS", "A class with this name and arm already exists");
        }
    }
    async assignClassTeacher(organizationId, classId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).assignClassTeacherLocked(organizationId, classId, input));
    }
    async assignClassTeacherLocked(organizationId, classId, input) {
        const cls = await this.requireClass(organizationId, classId);
        if (input.classTeacherId && !cls.isActive)
            throw new errors_1.AppError(400, "INACTIVE_CLASS", "Cannot staff an inactive class");
        if (input.classTeacherId) {
            await this.assertTeacherMembership(organizationId, input.classTeacherId);
            await this.assertTeacherFree(organizationId, input.classTeacherId, classId);
        }
        try {
            return await this.db.class.update({
                where: { id: classId },
                data: { classTeacherId: input.classTeacherId },
                include: classInclude,
            });
        }
        catch {
            throw new errors_1.AppError(409, "TEACHER_ASSIGNED", "This teacher is already class teacher of another class");
        }
    }
    async listSubjects(organizationId, classId) {
        await this.requireClass(organizationId, classId);
        const rows = await this.db.classSubject.findMany({
            where: { classId, organizationId },
            include: {
                subject: {
                    select: { id: true, name: true, code: true, isActive: true },
                },
            },
            orderBy: { subject: { name: "asc" } },
        });
        return rows.map((r) => r.subject);
    }
    async addSubject(organizationId, classId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).addSubjectLocked(organizationId, classId, input));
    }
    async addSubjectLocked(organizationId, classId, input) {
        const cls = await this.requireClass(organizationId, classId);
        if (!cls.isActive)
            throw new errors_1.AppError(400, "INACTIVE_CLASS", "Cannot add curriculum to an inactive class");
        const subjects = await this.db.subject.findMany({
            where: {
                id: { in: input.subjectIds },
                organizationId,
                isActive: true,
            },
            select: {
                id: true,
            },
        });
        if (subjects.length !== input.subjectIds.length) {
            throw new errors_1.AppError(404, "NOT_FOUND", "One or more subjects were not found");
        }
        try {
            await this.db.classSubject.createMany({
                data: input.subjectIds.map((subjectId) => ({
                    organizationId,
                    classId,
                    subjectId,
                })),
                skipDuplicates: true,
            });
        }
        catch {
            throw new errors_1.AppError(409, "SUBJECT_LINK_FAILED", "Unable to link subjects to this class");
        }
        return this.listSubjects(organizationId, classId);
    }
    // async addSubject(
    //   organizationId: string,
    //   classId: string,
    //   input: z.infer<typeof addClassSubjectSchema>
    // ) {
    //   await this.requireClass(organizationId, classId);
    //   const subject = await prisma.subject.findFirst({
    //     where: { id: input.subjectId, organizationId, isActive: true },
    //   });
    //   if (!subject) {
    //     throw new AppError(404, "NOT_FOUND", "Subject not found");
    //   }
    //   try {
    //     await prisma.classSubject.create({
    //       data: {
    //         organizationId,
    //         classId,
    //         subjectId: input.subjectId,
    //       },
    //     });
    //   } catch {
    //     throw new AppError(
    //       409,
    //       "SUBJECT_LINKED",
    //       "Subject is already linked to this class"
    //     );
    //   }
    //   return this.listSubjects(organizationId, classId);
    // }
    async removeSubject(organizationId, classId, subjectId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).removeSubjectLocked(organizationId, classId, subjectId));
    }
    async removeSubjectLocked(organizationId, classId, subjectId) {
        await this.requireClass(organizationId, classId);
        const link = await this.db.classSubject.findFirst({
            where: { organizationId, classId, subjectId },
        });
        if (!link) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Subject is not linked to this class");
        }
        await this.db.classSubjectTeacher.deleteMany({ where: { organizationId, classId, subjectId } });
        await this.db.classSubject.delete({ where: { id: link.id } });
        return { ok: true };
    }
    async assignSubjectTeacher(organizationId, classId, subjectId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).assignSubjectTeacherLocked(organizationId, classId, subjectId, input));
    }
    async assignSubjectTeacherLocked(organizationId, classId, subjectId, input) {
        await this.requireClass(organizationId, classId);
        await (0, staffing_1.requireCurriculum)(this.db, organizationId, classId, subjectId);
        await this.assertTeacherMembership(organizationId, input.userId);
        const row = await this.db.classSubjectTeacher.upsert({
            where: {
                classId_subjectId: { classId, subjectId },
            },
            create: {
                organizationId,
                classId,
                subjectId,
                userId: input.userId,
            },
            update: { userId: input.userId },
            include: {
                subject: { select: { id: true, name: true, code: true } },
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });
        return {
            subjectId: row.subjectId,
            subject: row.subject,
            teacher: row.user,
        };
    }
    async removeSubjectTeacher(organizationId, classId, subjectId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new ClassesService(tx).removeSubjectTeacherLocked(organizationId, classId, subjectId));
    }
    async removeSubjectTeacherLocked(organizationId, classId, subjectId) {
        const row = await this.db.classSubjectTeacher.findFirst({
            where: { organizationId, classId, subjectId },
        });
        if (!row) {
            throw new errors_1.AppError(404, "NOT_FOUND", "No teacher assigned for this subject");
        }
        await this.db.classSubjectTeacher.delete({ where: { id: row.id } });
        return { ok: true };
    }
    async requireClass(organizationId, classId) {
        const row = await this.db.class.findFirst({
            where: { id: classId, organizationId },
            select: { id: true, isActive: true },
        });
        if (!row) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Class not found");
        }
        return row;
    }
    async assertTeacherMembership(organizationId, userId) {
        await (0, staffing_1.requireTeachingMember)(this.db, organizationId, userId);
    }
    async assertTeacherFree(organizationId, userId, exceptClassId) {
        const existing = await this.db.class.findFirst({
            where: {
                organizationId,
                classTeacherId: userId,
                ...(exceptClassId ? { NOT: { id: exceptClassId } } : {}),
            },
            select: { id: true, name: true, arm: true },
        });
        if (existing) {
            throw new errors_1.AppError(409, "TEACHER_ASSIGNED", "This teacher is already class teacher of another class");
        }
    }
}
exports.ClassesService = ClassesService;
exports.classesService = new ClassesService();
