"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherService = void 0;
// src/features/teachers/teacher.service.ts
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const password_1 = require("../../lib/password");
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
            role: { in: STAFF_ROLES },
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
            role: query.role ? query.role : { in: STAFF_ROLES },
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
    /**
     * Invite / add staff:
     * - Existing user → add membership (or reactivate)
     * - New user → create User + membership
     */
    async invite(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        const role = input.role ?? client_1.OrgRole.TEACHER;
        if (input.phone) {
            const phoneOwner = await prisma_1.prisma.user.findUnique({
                where: { phone: input.phone },
            });
            // allow same user; block if different user has phone
            // checked after we know user identity
        }
        let user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
        if (user) {
            if (input.phone && user.phone && user.phone !== input.phone) {
                const taken = await prisma_1.prisma.user.findFirst({
                    where: { phone: input.phone, NOT: { id: user.id } },
                });
                if (taken)
                    throw new AppError_1.ConflictError("Phone already in use");
            }
            const existingMembership = await prisma_1.prisma.membership.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId,
                    },
                },
            });
            if (existingMembership) {
                if (existingMembership.isActive &&
                    STAFF_ROLES.includes(existingMembership.role)) {
                    throw new AppError_1.ConflictError("This user is already a staff member here");
                }
                // Reactivate / set staff role
                await prisma_1.prisma.membership.update({
                    where: { id: existingMembership.id },
                    data: { isActive: true, role },
                });
            }
            else {
                // Already SCHOOL_ADMIN membership?
                if (existingMembership === null) {
                    await prisma_1.prisma.membership.create({
                        data: {
                            userId: user.id,
                            organizationId,
                            role,
                            isActive: true,
                        },
                    });
                }
            }
            // If they were only admin, unique constraint means one membership per org —
            // so we UPDATE role only if we're OK changing SCHOOL_ADMIN → TEACHER (usually not).
            // Re-fetch membership
            const mem = await prisma_1.prisma.membership.findUnique({
                where: {
                    userId_organizationId: { userId: user.id, organizationId },
                },
            });
            if (!mem)
                throw new AppError_1.BadRequestError("Could not attach membership");
            if (mem.role === client_1.OrgRole.SCHOOL_ADMIN) {
                throw new AppError_1.ConflictError("This user is already a school admin in this organization");
            }
            if (!STAFF_ROLES.includes(mem.role)) {
                await prisma_1.prisma.membership.update({
                    where: { id: mem.id },
                    data: { role, isActive: true },
                });
            }
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    firstName: input.firstName,
                    lastName: input.lastName,
                    ...(input.phone !== undefined ? { phone: input.phone } : {}),
                },
            });
        }
        else {
            if (input.phone) {
                const taken = await prisma_1.prisma.user.findUnique({
                    where: { phone: input.phone },
                });
                if (taken)
                    throw new AppError_1.ConflictError("Phone already in use");
            }
            const passwordHash = input.temporaryPassword
                ? await (0, password_1.hashPassword)(input.temporaryPassword)
                : null;
            user = await prisma_1.prisma.user.create({
                data: {
                    email: input.email,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    phone: input.phone,
                    passwordHash,
                    globalRole: client_1.GlobalRole.USER,
                    isActive: true,
                    memberships: {
                        create: {
                            organizationId,
                            role,
                            isActive: true,
                        },
                    },
                },
            });
        }
        return toTeacherPublic(organizationId, user.id);
    },
    async update(schoolId, userId, input) {
        const organizationId = requireSchoolId(schoolId);
        const membership = await loadTeacherInOrg(organizationId, userId);
        if (input.phone !== undefined && input.phone) {
            const taken = await prisma_1.prisma.user.findFirst({
                where: { phone: input.phone, NOT: { id: userId } },
            });
            if (taken)
                throw new AppError_1.ConflictError("Phone already in use");
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.update({
                where: { id: userId },
                data: {
                    ...(input.firstName !== undefined
                        ? { firstName: input.firstName }
                        : {}),
                    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
                    ...(input.phone !== undefined ? { phone: input.phone } : {}),
                },
            }),
            prisma_1.prisma.membership.update({
                where: { id: membership.id },
                data: {
                    ...(input.role !== undefined ? { role: input.role } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                },
            }),
        ]);
        return toTeacherPublic(organizationId, userId);
    },
    /** Soft-remove from school staff */
    async remove(schoolId, userId) {
        const organizationId = requireSchoolId(schoolId);
        const membership = await loadTeacherInOrg(organizationId, userId);
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.membership.update({
                where: { id: membership.id },
                data: { isActive: false },
            }),
            prisma_1.prisma.class.updateMany({
                where: { organizationId, classTeacherId: userId },
                data: { classTeacherId: null },
            }),
            prisma_1.prisma.classSubjectTeacher.deleteMany({
                where: { organizationId, userId },
            }),
        ]);
        return toTeacherPublic(organizationId, userId);
    },
    /** Replace subject-teacher rows for this teacher */
    async setAssignments(schoolId, userId, input) {
        const organizationId = requireSchoolId(schoolId);
        await loadTeacherInOrg(organizationId, userId);
        for (const a of input.assignments) {
            const cls = await prisma_1.prisma.class.findFirst({
                where: { id: a.classId, organizationId },
            });
            if (!cls)
                throw new AppError_1.BadRequestError(`Invalid class: ${a.classId}`);
            const sub = await prisma_1.prisma.subject.findFirst({
                where: { id: a.subjectId, organizationId, isActive: true },
            });
            if (!sub)
                throw new AppError_1.BadRequestError(`Invalid subject: ${a.subjectId}`);
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.classSubjectTeacher.deleteMany({
                where: { organizationId, userId },
            });
            if (input.assignments.length) {
                await tx.classSubjectTeacher.createMany({
                    data: input.assignments.map((a) => ({
                        organizationId,
                        userId,
                        classId: a.classId,
                        subjectId: a.subjectId,
                    })),
                    skipDuplicates: true,
                });
            }
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
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        if (input.teacherId) {
            await loadTeacherInOrg(organizationId, input.teacherId);
        }
        const updated = await prisma_1.prisma.class.update({
            where: { id: classId },
            data: { classTeacherId: input.teacherId },
            include: {
                classTeacher: {
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
            classId: updated.id,
            classTeacher: updated.classTeacher
                ? {
                    id: updated.classTeacher.id,
                    firstName: updated.classTeacher.firstName,
                    lastName: updated.classTeacher.lastName,
                    email: updated.classTeacher.email,
                }
                : null,
        };
    },
    /** One subject teacher for one class */
    async setClassSubjectTeacher(schoolId, classId, input) {
        const organizationId = requireSchoolId(schoolId);
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        const subject = await prisma_1.prisma.subject.findFirst({
            where: { id: input.subjectId, organizationId },
        });
        if (!subject)
            throw new AppError_1.BadRequestError("Subject not found");
        const offered = await prisma_1.prisma.classSubject.findFirst({
            where: { classId, subjectId: input.subjectId, organizationId },
        });
        if (!offered) {
            throw new AppError_1.BadRequestError("This subject is not on the class curriculum. Add it to the class first.");
        }
        if (input.teacherId === null) {
            await prisma_1.prisma.classSubjectTeacher.deleteMany({
                where: { classId, subjectId: input.subjectId },
            });
            return {
                classId,
                subjectId: input.subjectId,
                teacherId: null,
            };
        }
        await loadTeacherInOrg(organizationId, input.teacherId);
        const row = await prisma_1.prisma.classSubjectTeacher.upsert({
            where: {
                classId_subjectId: {
                    classId,
                    subjectId: input.subjectId,
                },
            },
            create: {
                organizationId,
                classId,
                subjectId: input.subjectId,
                userId: input.teacherId,
            },
            update: { userId: input.teacherId },
        });
        return {
            classId,
            subjectId: row.subjectId,
            teacherId: row.userId,
        };
    },
    async listClassSubjectTeachers(schoolId, classId) {
        const organizationId = requireSchoolId(schoolId);
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId },
        });
        if (!cls)
            throw new AppError_1.NotFoundError("Class not found");
        const subjects = await prisma_1.prisma.subject.findMany({
            where: { organizationId, isActive: true },
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
