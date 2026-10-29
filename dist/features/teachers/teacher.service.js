"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherService = void 0;
const rbac_1 = require("../../auth/rbac");
const memberships_service_1 = require("../memberships/memberships.service");
// src/features/teachers/teacher.service.ts
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const staffing_1 = require("../../lib/staffing");
const classes_service_1 = require("../classes/classes.service");
const AppError_1 = require("../../common/errors/AppError");
const STAFF_ROLES = [client_1.OrgRole.TEACHER, client_1.OrgRole.EXAM_OFFICER];
function requireSchoolId(schoolId) {
    if (!schoolId)
        throw new AppError_1.ForbiddenError("No school context");
    return schoolId;
}
function displayClass(name, arm) {
    return arm ? `${name} ${arm}` : name;
}
function mapRole(role) {
    if (role === client_1.OrgRole.EXAM_OFFICER)
        return "EXAM_OFFICER";
    return "TEACHER";
}
async function loadTeacherInOrg(organizationId, userId) {
    const membership = await prisma_1.prisma.membership.findFirst({
        where: {
            organizationId,
            userId,
            ...(0, rbac_1.rolesWhere)(STAFF_ROLES),
        },
        include: {
            user: true,
        },
    });
    if (!membership)
        throw new AppError_1.NotFoundError("Teacher not found in this school");
    return membership;
}
async function toTeacherPublic(organizationId, userId) {
    const membership = await loadTeacherInOrg(organizationId, userId);
    const { user } = membership;
    const [subjectAssignments, classTeacherOf] = await Promise.all([
        prisma_1.prisma.classSubjectTeacher.findMany({
            where: { organizationId, userId },
            include: { class: true, subject: true },
            orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
        }),
        prisma_1.prisma.class.findMany({
            where: { organizationId, classTeacherId: userId, isActive: true },
            orderBy: [{ name: "asc" }, { arm: "asc" }],
        }),
    ]);
    return {
        id: user.id,
        membershipId: membership.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`.trim(),
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: mapRole(membership.role),
        roles: (0, rbac_1.membershipRoles)(membership),
        isActive: membership.isActive && user.isActive,
        joinedAt: membership.joinedAt,
        assignments: subjectAssignments.map((a) => ({
            id: a.id,
            classId: a.classId,
            className: a.class.name,
            classArm: a.class.arm,
            classDisplayName: displayClass(a.class.name, a.class.arm),
            subjectId: a.subjectId,
            subjectName: a.subject.name,
        })),
        classTeacherOf: classTeacherOf.map((c) => ({
            id: c.id,
            name: c.name,
            arm: c.arm,
            displayName: displayClass(c.name, c.arm),
        })),
    };
}
exports.teacherService = {
    async list(schoolId, query) {
        const organizationId = requireSchoolId(schoolId);
        const where = {
            organizationId,
            ...(0, rbac_1.rolesWhere)(query.role ? [query.role] : STAFF_ROLES),
        };
        if (query.isActive === "true")
            where.isActive = true;
        if (query.isActive === "false")
            where.isActive = false;
        if (query.search?.trim()) {
            const q = query.search.trim();
            where.user = {
                OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q, mode: "insensitive" } },
                ],
            };
        }
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const skip = (page - 1) * pageSize;
        if (query.classTeacherAvailable === "true") {
            const assigned = await prisma_1.prisma.class.findMany({
                where: { organizationId, classTeacherId: { not: null } },
                select: { classTeacherId: true },
            });
            let assignedIds = assigned
                .map((c) => c.classTeacherId)
                .filter((id) => Boolean(id));
            // Allow current form teacher of *this* class to still appear in the select
            if (query.includeUserId) {
                assignedIds = assignedIds.filter((id) => id !== query.includeUserId);
            }
            if (assignedIds.length > 0) {
                where.userId = { notIn: assignedIds };
            }
        }
        const [total, rows] = await Promise.all([
            prisma_1.prisma.membership.count({ where }),
            prisma_1.prisma.membership.findMany({
                where,
                include: { user: true },
                orderBy: { joinedAt: "desc" },
                skip,
                take: Number(pageSize),
            }),
        ]);
        const items = await Promise.all(rows.map((m) => toTeacherPublic(organizationId, m.userId)));
        return {
            items,
            meta: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize) || 1,
            },
        };
    },
    async getById(schoolId, userId) {
        const organizationId = requireSchoolId(schoolId);
        return toTeacherPublic(organizationId, userId);
    },
    async update(schoolId, userId, input, actor) {
        const organizationId = requireSchoolId(schoolId);
        if (actor) {
            const member = await loadTeacherInOrg(organizationId, userId);
            await memberships_service_1.membershipsService.update(organizationId, member.id, actor, input);
            return toTeacherPublic(organizationId, userId);
        }
        await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const membership = await tx.membership.findFirst({ where: { organizationId, userId, ...(0, rbac_1.rolesWhere)(STAFF_ROLES) } });
            if (!membership)
                throw new AppError_1.NotFoundError("Teacher not found in this school");
            await tx.membership.update({ where: { id: membership.id }, data: { ...input, ...(input.role ? { roles: [input.role] } : {}) } });
            if (input.isActive === false) {
                await tx.class.updateMany({ where: { organizationId, classTeacherId: userId }, data: { classTeacherId: null } });
                await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
            }
        });
        return toTeacherPublic(organizationId, userId);
    },
    /** Soft-remove from school staff */
    async remove(schoolId, userId, actor) {
        const organizationId = requireSchoolId(schoolId);
        return this.update(organizationId, userId, { isActive: false }, actor);
    },
    /** Replace subject-teacher rows for this teacher */
    async setAssignments(schoolId, userId, input) {
        const organizationId = requireSchoolId(schoolId);
        await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const member = await (0, staffing_1.requireTeachingMember)(tx, organizationId, userId);
            if (!(0, rbac_1.membershipRoles)(member).some(role => STAFF_ROLES.includes(role)))
                throw new AppError_1.NotFoundError("Teacher not found in this school");
            for (const assignment of input.assignments) {
                await (0, staffing_1.requireCurriculum)(tx, organizationId, assignment.classId, assignment.subjectId);
                const current = await tx.classSubjectTeacher.findUnique({ where: { classId_subjectId: assignment } });
                if (current && current.userId !== userId) {
                    throw new AppError_1.ConflictError("A requested class subject already has another teacher; use the class assignment endpoint to replace them");
                }
            }
            await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
            if (input.assignments.length)
                await tx.classSubjectTeacher.createMany({ data: input.assignments.map(a => ({ ...a, organizationId, userId })) });
        });
        return toTeacherPublic(organizationId, userId);
    },
    async getMyAssignments(schoolId, userId) {
        const organizationId = requireSchoolId(schoolId);
        // Teacher may only read self; admin can use getById
        return toTeacherPublic(organizationId, userId);
    },
    /** Class form teacher */
    async setClassTeacher(schoolId, classId, input) {
        const organizationId = requireSchoolId(schoolId);
        const updated = await classes_service_1.classesService.assignClassTeacher(organizationId, classId, { classTeacherId: input.teacherId });
        return { classId: updated.id, classTeacher: updated.classTeacher };
    },
    /** One subject teacher for one class */
    async setClassSubjectTeacher(schoolId, classId, input) {
        const organizationId = requireSchoolId(schoolId);
        if (input.teacherId === null) {
            await classes_service_1.classesService.clearSubjectTeacher(organizationId, classId, input.subjectId);
        }
        else {
            await classes_service_1.classesService.assignSubjectTeacher(organizationId, classId, input.subjectId, { userId: input.teacherId });
        }
        return { classId, subjectId: input.subjectId, teacherId: input.teacherId };
    },
    async listClassSubjectTeachers(schoolId, classId) {
        const organizationId = requireSchoolId(schoolId);
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        const subjects = await prisma_1.prisma.subject.findMany({
            where: { organizationId, isActive: true, classSubjects: { some: { organizationId, classId } } },
            orderBy: { name: "asc" },
        });
        const assigned = await prisma_1.prisma.classSubjectTeacher.findMany({
            where: { classId, organizationId },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        const bySubject = new Map(assigned.map((a) => [a.subjectId, a]));
        return {
            items: subjects.map((s) => {
                const a = bySubject.get(s.id);
                return {
                    subjectId: s.id,
                    subjectName: s.name,
                    teacherId: a?.userId ?? null,
                    teacherName: a
                        ? `${a.user.firstName} ${a.user.lastName}`.trim()
                        : null,
                };
            }),
        };
    },
};
