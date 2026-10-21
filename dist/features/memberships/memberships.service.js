"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.membershipsService = exports.MembershipsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const invitations_service_1 = require("../auth/invitations.service");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const staffing_1 = require("../../lib/staffing");
const SAFE_ROLES_FOR_NON_OWNER = [
    "PRINCIPAL",
    "BURSAR",
    "SCHOOL_ADMIN",
    "TEACHER",
    "EXAM_OFFICER",
    "PARENT",
    "STAFF",
];
class MembershipsService {
    async list(organizationId, query) {
        const skip = (query.page - 1) * query.limit;
        const where = { organizationId };
        const [rows, total] = await Promise.all([
            prisma_1.prisma.membership.findMany({
                where,
                skip,
                take: query.limit,
                orderBy: { joinedAt: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                            isActive: true,
                        },
                    },
                },
            }),
            prisma_1.prisma.membership.count({ where }),
        ]);
        return {
            items: rows.map((m) => ({
                id: m.id,
                role: m.role,
                isActive: m.isActive,
                joinedAt: m.joinedAt,
                user: m.user,
            })),
            meta: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit) || 1,
            },
        };
    }
    async create(organizationId, actor, input, requestId) {
        return invitations_service_1.invitationsService.create(organizationId, actor.userId, input, requestId);
    }
    async update(organizationId, membershipId, actor, input, requestId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const manager = await tx.membership.findFirst({ where: { organizationId, userId: actor.userId,
                    isActive: true, user: { isActive: true } } });
            if (!manager || !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(manager.role)) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Cannot manage memberships");
            }
            actor = { ...actor, orgRole: manager.role };
            const membership = await tx.membership.findFirst({
                where: { id: membershipId, organizationId },
            });
            if (!membership) {
                throw new errors_1.AppError(404, "NOT_FOUND", "Membership not found");
            }
            if (membership.role === "PROPRIETOR" && actor.orgRole !== "PROPRIETOR") {
                throw new errors_1.AppError(403, "FORBIDDEN", "Only a proprietor can manage another proprietor");
            }
            if (input.role) {
                this.assertCanAssignRole(actor.orgRole, input.role);
            }
            // Prevent removing last PROPRIETOR
            if (membership.role === "PROPRIETOR" &&
                ((input.role !== undefined && input.role !== "PROPRIETOR") ||
                    input.isActive === false)) {
                const proprietors = await tx.membership.count({
                    where: {
                        organizationId,
                        role: "PROPRIETOR",
                        isActive: true,
                    },
                });
                if (proprietors <= 1) {
                    throw new errors_1.AppError(400, "LAST_PROPRIETOR", "Cannot remove or demote the last proprietor");
                }
            }
            const updated = await tx.membership.update({
                where: { id: membershipId },
                data: {
                    role: input.role,
                    isActive: input.isActive,
                },
            });
            if (!updated.isActive || !staffing_1.TEACHING_ROLES.includes(updated.role)) {
                await (0, staffing_1.clearStaffAssignments)(tx, organizationId, membership.userId);
            }
            if (input.role && input.role !== membership.role) {
                await tx.auditLog.create({ data: {
                        action: "ROLE_CHANGED",
                        actorId: actor.userId,
                        organizationId,
                        entity: "Membership",
                        entityId: membershipId,
                        metadata: { from: membership.role, to: input.role },
                        requestId,
                    } });
            }
            if (input.isActive !== undefined && input.isActive !== membership.isActive) {
                await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", actorId: actor.userId, organizationId,
                        entity: "Membership", entityId: membershipId, requestId, metadata: { isActive: input.isActive } } });
            }
            return updated;
        });
    }
    assertCanAssignRole(actorRole, targetRole) {
        if (targetRole === "PROPRIETOR" && actorRole !== "PROPRIETOR") {
            throw new errors_1.AppError(403, "FORBIDDEN", "Only a proprietor can assign proprietor access");
        }
        if (actorRole === "PROPRIETOR" || actorRole === "SCHOOL_ADMIN") {
            return;
        }
        if (actorRole === "PRINCIPAL") {
            if (targetRole === "PROPRIETOR") {
                throw new errors_1.AppError(403, "FORBIDDEN", "Cannot assign proprietor role");
            }
            if (!SAFE_ROLES_FOR_NON_OWNER.includes(targetRole) &&
                targetRole !== "PRINCIPAL") {
                // principal may assign teacher, bursar, etc.
            }
            return;
        }
        throw new errors_1.AppError(403, "FORBIDDEN", "Cannot manage memberships");
    }
}
exports.MembershipsService = MembershipsService;
exports.membershipsService = new MembershipsService();
