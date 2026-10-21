"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentsService = exports.ParentsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const invitations_service_1 = require("../auth/invitations.service");
class ParentsService {
    async me(organizationId, userId) {
        const parent = await prisma_1.prisma.parent.findFirst({
            where: { organizationId, userId, isActive: true },
            select: {
                id: true, firstName: true, lastName: true, phone: true, email: true,
                children: {
                    where: { organizationId, student: { organizationId, isActive: true } },
                    select: {
                        relation: true, isPrimary: true,
                        student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true, classId: true } },
                    },
                    orderBy: { studentId: "asc" },
                },
            },
        });
        if (!parent)
            throw new errors_1.AppError(403, "NOT_A_PARENT", "No active parent profile linked in this school");
        return parent;
    }
    async list(organizationId, query) {
        const where = {
            organizationId,
            ...(query.q
                ? {
                    OR: [
                        { firstName: { contains: query.q, mode: "insensitive" } },
                        { lastName: { contains: query.q, mode: "insensitive" } },
                        { phone: { contains: query.q } },
                        { email: { contains: query.q, mode: "insensitive" } },
                    ],
                }
                : {}),
        };
        const skip = (query.page - 1) * query.limit;
        const [items, total] = await Promise.all([
            prisma_1.prisma.parent.findMany({
                where,
                include: {
                    _count: { select: { children: true } },
                    user: { select: { id: true, email: true, isActive: true } },
                },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
                skip,
                take: query.limit,
            }),
            prisma_1.prisma.parent.count({ where }),
        ]);
        return {
            items: items.map((p) => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                phone: p.phone,
                email: p.email,
                isActive: p.isActive,
                childCount: p._count.children,
                user: p.user,
                createdAt: p.createdAt,
            })),
            meta: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit) || 1,
            },
        };
    }
    async get(organizationId, parentId) {
        const parent = await prisma_1.prisma.parent.findFirst({
            where: { id: parentId, organizationId },
            include: {
                user: {
                    select: { id: true, email: true, firstName: true, lastName: true },
                },
                children: {
                    where: { organizationId, student: { organizationId } },
                    include: {
                        student: {
                            select: {
                                id: true,
                                admissionNumber: true,
                                firstName: true,
                                lastName: true,
                                classId: true,
                                isActive: true,
                            },
                        },
                    },
                },
            },
        });
        if (!parent)
            throw new errors_1.AppError(404, "NOT_FOUND", "Parent not found");
        return parent;
    }
    async create(organizationId, input) {
        return prisma_1.prisma.parent.create({
            data: {
                organizationId,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone ?? null,
                email: input.email ?? null,
            },
        });
    }
    async update(organizationId, parentId, input) {
        await this.requireParent(organizationId, parentId);
        return prisma_1.prisma.parent.update({
            where: { id: parentId },
            data: {
                firstName: input.firstName,
                lastName: input.lastName,
                phone: input.phone === undefined ? undefined : input.phone,
                email: input.email === undefined ? undefined : input.email,
                isActive: input.isActive,
            },
        });
    }
    async linkStudent(organizationId, parentId, input) {
        await this.requireParent(organizationId, parentId);
        const student = await prisma_1.prisma.student.findFirst({
            where: { id: input.studentId, organizationId },
            select: { id: true },
        });
        if (!student) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Student not found");
        }
        try {
            return await prisma_1.prisma.parentStudent.create({
                data: {
                    organizationId,
                    parentId,
                    studentId: input.studentId,
                    relation: input.relation ?? null,
                    isPrimary: input.isPrimary ?? true,
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
                },
            });
        }
        catch {
            throw new errors_1.AppError(409, "ALREADY_LINKED", "This student is already linked to this parent");
        }
    }
    async unlinkStudent(organizationId, parentId, studentId) {
        const link = await prisma_1.prisma.parentStudent.findFirst({
            where: { organizationId, parentId, studentId },
        });
        if (!link) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Link not found");
        }
        await prisma_1.prisma.parentStudent.delete({ where: { id: link.id } });
        return { ok: true };
    }
    /**
     * Queues an invitation; acceptance creates the membership and links the parent.
     */
    async inviteUser(organizationId, parentId, actorId, input, requestId) {
        const parent = await this.requireParent(organizationId, parentId);
        return invitations_service_1.invitationsService.create(organizationId, actorId, { email: input.email, firstName: parent.firstName,
            lastName: parent.lastName, ...(parent.phone ? { phone: parent.phone } : {}), role: "PARENT", parentId }, requestId);
    }
    async requireParent(organizationId, parentId) {
        const row = await prisma_1.prisma.parent.findFirst({
            where: { id: parentId, organizationId },
        });
        if (!row)
            throw new errors_1.AppError(404, "NOT_FOUND", "Parent not found");
        return row;
    }
}
exports.ParentsService = ParentsService;
exports.parentsService = new ParentsService();
