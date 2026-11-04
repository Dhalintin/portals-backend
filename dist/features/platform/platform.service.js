"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformService = exports.PlatformService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const password_1 = require("../../lib/password");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
class PlatformService {
    // ─── Schools ───────────────────────────────────────────────────
    async listSchools(query) {
        const where = {};
        if (query.isActive !== undefined)
            where.isActive = query.isActive;
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
            ];
        }
        if (query.plan) {
            where.subscription = { plan: query.plan };
        }
        return prisma_1.prisma.organization.findMany({
            where,
            take: query.limit ?? 20,
            ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                slug: true,
                email: true,
                phone: true,
                city: true,
                state: true,
                isActive: true,
                onBoarded: true,
                createdAt: true,
                logoUrl: true,
                subscription: {
                    select: {
                        plan: true,
                        status: true,
                        studentCap: true,
                        sponsorship: true,
                        currentPeriodEnd: true,
                    },
                },
                _count: {
                    select: {
                        students: { where: { isActive: true } },
                        memberships: { where: { isActive: true } },
                    },
                },
            },
        });
    }
    async getSchool(organizationId) {
        const school = await prisma_1.prisma.organization.findUnique({
            where: { id: organizationId },
            include: {
                subscription: true,
                site: true,
                _count: {
                    select: {
                        students: { where: { isActive: true } },
                        memberships: { where: { isActive: true } },
                        classes: true,
                        invoices: true,
                    },
                },
                memberships: {
                    where: { isActive: true },
                    take: 20,
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                globalRole: true,
                            },
                        },
                    },
                },
            },
        });
        if (!school)
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        return school;
    }
    async setSchoolActive(organizationId, isActive, actorId, reason, meta) {
        const school = await prisma_1.prisma.organization.findUnique({
            where: { id: organizationId },
        });
        if (!school)
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        if (!reason || reason.trim().length < 5)
            throw new errors_1.AppError(400, "REASON_REQUIRED", "Enter a clear reason for changing school access.");
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const updated = await tx.organization.update({ where: { id: organizationId }, data: { isActive } });
            await tx.auditLog.create({ data: { organizationId, actorId, action: "SETTINGS_CHANGED", entity: "Organization", entityId: organizationId, metadata: { operation: "SCHOOL_ACCESS_CHANGED", isActive, reason }, requestId: meta?.requestId } });
            return updated;
        });
    }
    // ─── Subscriptions ─────────────────────────────────────────────
    async updateSubscription(organizationId, data, actorId, meta) {
        throw new errors_1.AppError(410, "LEGACY_BILLING_RETIRED", "Use term subscription bills and verified payments.");
    }
    // ─── Platform admin assignments ────────────────────────────────
    async assignPlatformAdmin(data, assignedById) {
        const [user, org] = await Promise.all([
            prisma_1.prisma.user.findUnique({ where: { id: data.userId } }),
            prisma_1.prisma.organization.findUnique({ where: { id: data.organizationId } }),
        ]);
        if (!user)
            throw new errors_1.AppError(404, "USER_NOT_FOUND", "User not found");
        if (!["PLATFORM_ADMIN", "SUPER_ADMIN"].includes(user.globalRole))
            throw new errors_1.AppError(400, "PLATFORM_ROLE_REQUIRED", "Choose an existing platform administrator.");
        if (!org)
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        return prisma_1.prisma.platformAdminAssignment.upsert({
            where: {
                userId_organizationId: {
                    userId: data.userId,
                    organizationId: data.organizationId,
                },
            },
            create: {
                userId: data.userId,
                organizationId: data.organizationId,
                assignedById,
                note: data.note,
            },
            update: {
                assignedById,
                note: data.note,
            },
        });
    }
    async removePlatformAdmin(userId, organizationId) {
        await prisma_1.prisma.platformAdminAssignment.deleteMany({
            where: { userId, organizationId },
        });
        return { ok: true };
    }
    async listPlatformAdmins(organizationId) {
        return prisma_1.prisma.platformAdminAssignment.findMany({
            where: organizationId ? { organizationId } : {},
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        globalRole: true,
                    },
                },
                organization: { select: { id: true, name: true, slug: true } },
                assignedBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }
    // ─── Platform user creation (SUPER_ADMIN only) ─────────────────
    async createPlatformUser(input, actorId) {
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: input.email },
        });
        if (existing) {
            throw new errors_1.AppError(409, "EMAIL_IN_USE", "Email already registered");
        }
        const passwordHash = await (0, password_1.hashPassword)(input.password);
        return prisma_1.prisma.$transaction(async (tx) => {
            const created = await tx.user.create({
                data: {
                    email: input.email,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    passwordHash,
                    globalRole: input.globalRole,
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    globalRole: true,
                    createdAt: true,
                },
            });
            await tx.auditLog.create({ data: { actorId: actorId ?? created.id, action: "SETTINGS_CHANGED", entity: "PlatformUser", entityId: created.id, metadata: { operation: "PLATFORM_USER_CREATED", globalRole: created.globalRole } } });
            return created;
        });
    }
    // ─── Platform metrics (lightweight) ────────────────────────────
    async platformMetrics() {
        const [totalSchools, activeSchools, totalStudents, totalUsers, planBreakdown, recentSchools,] = await Promise.all([
            prisma_1.prisma.organization.count(),
            prisma_1.prisma.organization.count({ where: { isActive: true } }),
            prisma_1.prisma.student.count({ where: { isActive: true } }),
            prisma_1.prisma.user.count({ where: { isActive: true } }),
            prisma_1.prisma.subscription.groupBy({
                by: ["plan"],
                _count: true,
            }),
            prisma_1.prisma.organization.findMany({
                take: 5,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    createdAt: true,
                    subscription: { select: { plan: true } },
                },
            }),
        ]);
        return {
            schools: { total: totalSchools, active: activeSchools },
            students: totalStudents,
            users: totalUsers,
            plans: planBreakdown.map((p) => ({
                plan: p.plan,
                count: p._count,
            })),
            recentSchools,
            generatedAt: new Date().toISOString(),
        };
    }
}
exports.PlatformService = PlatformService;
exports.platformService = new PlatformService();
