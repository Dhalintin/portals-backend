"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertTeachingAccess = assertTeachingAccess;
exports.assertClassTeacher = assertClassTeacher;
exports.assertSubjectTeacher = assertSubjectTeacher;
exports.assertParentChildAccess = assertParentChildAccess;
exports.teachingClassFilter = teachingClassFilter;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../lib/errors");
async function assertTeachingAccess(organizationId, actorId, classId, subjectId, db = prisma_1.prisma) {
    const membership = await db.membership.findFirst({
        where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } },
    });
    if (!membership || membership.role === "PARENT") {
        throw new errors_1.AppError(403, "FORBIDDEN", "Staff membership required");
    }
    const schoolClass = await db.class.findFirst({ where: { id: classId, organizationId, isActive: true } });
    if (!schoolClass)
        throw new errors_1.AppError(404, "CLASS_NOT_FOUND", "Class not found");
    if (subjectId) {
        const linked = await db.classSubject.findFirst({
            where: { organizationId, classId, subjectId, subject: { organizationId, isActive: true } },
        });
        if (!linked)
            throw new errors_1.AppError(400, "SUBJECT_NOT_LINKED", "Subject is not offered by this class");
    }
    if (membership.role !== "TEACHER")
        return;
    const assignment = await db.classSubjectTeacher.findFirst({
        where: { organizationId, classId, userId: actorId, ...(subjectId ? { subjectId } : {}) },
    });
    const allowed = subjectId ? !!assignment : schoolClass.classTeacherId === actorId || !!assignment;
    if (!allowed)
        throw new errors_1.AppError(403, "FORBIDDEN", "You are not assigned to this class or subject");
}
async function assertClassTeacher(organizationId, actorId, classId, db = prisma_1.prisma) {
    await assertTeachingAccess(organizationId, actorId, classId, undefined, db);
    const assigned = await db.class.findFirst({ where: { id: classId, organizationId, isActive: true, classTeacherId: actorId } });
    if (!assigned)
        throw new errors_1.AppError(403, "FORBIDDEN", "Only the assigned class teacher can mark attendance");
}
async function assertSubjectTeacher(organizationId, actorId, classId, subjectId, db = prisma_1.prisma) {
    await assertTeachingAccess(organizationId, actorId, classId, subjectId, db);
    const assigned = await db.classSubjectTeacher.findFirst({ where: { organizationId, classId, subjectId, userId: actorId } });
    if (!assigned)
        throw new errors_1.AppError(403, "FORBIDDEN", "Only the assigned subject teacher can enter scores");
}
async function assertParentChildAccess(auth, studentId) {
    const link = await prisma_1.prisma.parentStudent.findFirst({
        where: {
            organizationId: auth.schoolId, studentId,
            parent: { organizationId: auth.schoolId, userId: auth.userId, isActive: true },
            student: { organizationId: auth.schoolId },
        },
    });
    if (!link)
        throw new errors_1.AppError(404, "NOT_FOUND", "Child record not found");
}
function teachingClassFilter(auth) {
    return auth?.orgRole === "TEACHER" ? {
        organizationId: auth.schoolId,
        OR: [
            { classTeacherId: auth.userId },
            { subjectTeachers: { some: { organizationId: auth.schoolId, userId: auth.userId } } },
        ],
    } : {};
}
