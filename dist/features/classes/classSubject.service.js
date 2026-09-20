"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classSubjectService = void 0;
// src/features/classes/classSubject.service.ts
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function requireSchoolId(schoolId) {
    if (!schoolId)
        throw new AppError_1.ForbiddenError("No school context");
    return schoolId;
}
async function assertClassInOrg(organizationId, classId) {
    const cls = await prisma_1.prisma.class.findFirst({
        where: { id: classId, organizationId },
    });
    if (!cls)
        throw new AppError_1.NotFoundError("Class not found");
    return cls;
}
exports.classSubjectService = {
    /**
     * Subjects this class offers, plus optional subject teacher.
     */
    async listForClass(schoolId, classId) {
        const organizationId = requireSchoolId(schoolId);
        await assertClassInOrg(organizationId, classId);
        const rows = await prisma_1.prisma.classSubject.findMany({
            where: { classId, organizationId },
            include: {
                subject: true,
            },
            orderBy: { subject: { name: "asc" } },
        });
        const teachers = await prisma_1.prisma.classSubjectTeacher.findMany({
            where: { classId, organizationId },
            include: {
                user: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });
        const teacherBySubject = new Map(teachers.map((t) => [t.subjectId, t]));
        return {
            items: rows.map((r) => {
                const t = teacherBySubject.get(r.subjectId);
                return {
                    subjectId: r.subjectId,
                    name: r.subject.name,
                    code: r.subject.code,
                    isActive: r.subject.isActive,
                    teacher: t
                        ? {
                            id: t.user.id,
                            name: `${t.user.firstName} ${t.user.lastName}`.trim(),
                            email: t.user.email,
                        }
                        : null,
                };
            }),
        };
    },
    /**
     * Replace full curriculum for the class.
     * Removes ClassSubjectTeacher rows for subjects no longer offered.
     */
    async setForClass(schoolId, classId, input) {
        const organizationId = requireSchoolId(schoolId);
        await assertClassInOrg(organizationId, classId);
        console.log(schoolId);
        const uniqueIds = [...new Set(input.subjectIds)];
        if (uniqueIds.length) {
            const found = await prisma_1.prisma.subject.findMany({
                where: {
                    organizationId,
                    id: { in: uniqueIds },
                    isActive: true,
                },
                select: { id: true },
            });
            if (found.length !== uniqueIds.length) {
                throw new AppError_1.BadRequestError("One or more subjects are invalid or inactive for this school");
            }
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.classSubject.deleteMany({
                where: { classId, organizationId },
            });
            if (uniqueIds.length) {
                await tx.classSubject.createMany({
                    data: uniqueIds.map((subjectId) => ({
                        organizationId,
                        classId,
                        subjectId,
                    })),
                });
            }
            // Drop teaching assignments for subjects removed from curriculum
            await tx.classSubjectTeacher.deleteMany({
                where: {
                    classId,
                    organizationId,
                    ...(uniqueIds.length ? { subjectId: { notIn: uniqueIds } } : {}),
                },
            });
        });
        return this.listForClass(organizationId, classId);
    },
    async addSubject(schoolId, classId, subjectId) {
        const organizationId = requireSchoolId(schoolId);
        await assertClassInOrg(organizationId, classId);
        const subject = await prisma_1.prisma.subject.findFirst({
            where: { id: subjectId, organizationId, isActive: true },
        });
        if (!subject)
            throw new AppError_1.BadRequestError("Subject not found or inactive");
        await prisma_1.prisma.classSubject.upsert({
            where: {
                classId_subjectId: { classId, subjectId },
            },
            create: { organizationId, classId, subjectId },
            update: {},
        });
        return this.listForClass(organizationId, classId);
    },
    async removeSubject(schoolId, classId, subjectId) {
        const organizationId = requireSchoolId(schoolId);
        await assertClassInOrg(organizationId, classId);
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.classSubject.deleteMany({
                where: { classId, subjectId, organizationId },
            }),
            prisma_1.prisma.classSubjectTeacher.deleteMany({
                where: { classId, subjectId, organizationId },
            }),
        ]);
        return this.listForClass(organizationId, classId);
    },
};
