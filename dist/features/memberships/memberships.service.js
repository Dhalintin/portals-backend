"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.membershipsService = exports.MembershipsService = void 0;
const rbac_1 = require("../../auth/rbac");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const invitations_service_1 = require("../auth/invitations.service");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const staffing_1 = require("../../lib/staffing");
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
                roles: (0, rbac_1.membershipRoles)(m),
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
            if (!manager || !(0, rbac_1.membershipRoles)(manager).some(role => ["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(role))) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Cannot manage memberships");
            }
            actor = { ...actor, orgRole: (0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(manager)) };
            const membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
            if (!membership)
                throw new errors_1.AppError(404, "NOT_FOUND", "Membership not found");
            const before = (0, rbac_1.membershipRoles)(membership), requested = input.roles ?? (input.role ? [input.role] : before);
            const roles = [...new Set(requested)], role = (0, rbac_1.primaryRole)(roles);
            if ((before.includes('PROPRIETOR') || roles.includes('PROPRIETOR')) && actor.orgRole !== 'PROPRIETOR')
                throw new errors_1.AppError(403, 'FORBIDDEN', 'Only an owner can manage owner access');
            if (actor.orgRole === 'PRINCIPAL' && [...before, ...roles].some(role => !(0, rbac_1.principalCanManageRole)(role)))
                throw new errors_1.AppError(403, 'FORBIDDEN', 'Principals may manage academic roles only');
            for (const assigned of roles)
                this.assertCanAssignRole(actor.orgRole, assigned);
            if (before.includes('PARENT') !== roles.includes('PARENT'))
                throw new errors_1.AppError(400, 'ROLE_PORTAL_CHANGE', 'Parent and staff accounts cannot be converted through staff roles');
            if (before.includes('PROPRIETOR') && (!roles.includes('PROPRIETOR') || input.isActive === false)) {
                const count = await tx.membership.count({ where: { organizationId, isActive: true, role: 'PROPRIETOR' } });
                if (count <= 1)
                    throw new errors_1.AppError(400, 'LAST_PROPRIETOR', 'Cannot remove or demote the last proprietor');
            }
            const updated = await tx.membership.update({ where: { id: membershipId }, data: { role, roles, isActive: input.isActive } });
            if (!updated.isActive || !roles.some(role => (input.role || input.roles ? ['TEACHER', 'EXAM_OFFICER'] : staffing_1.TEACHING_ROLES).includes(role)))
                await (0, staffing_1.clearStaffAssignments)(tx, organizationId, membership.userId);
            if (JSON.stringify(before) !== JSON.stringify((0, rbac_1.membershipRoles)(updated)))
                await tx.auditLog.create({ data: { action: 'ROLE_CHANGED', actorId: actor.userId, organizationId, entity: 'Membership', entityId: membershipId, metadata: { from: before, to: (0, rbac_1.membershipRoles)(updated) }, requestId } });
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
            if (!(0, rbac_1.principalCanManageRole)(targetRole))
                throw new errors_1.AppError(403, "FORBIDDEN", "Principals may assign academic roles only.");
            return;
        }
        throw new errors_1.AppError(403, "FORBIDDEN", "Cannot manage memberships");
    }
}
exports.MembershipsService = MembershipsService;
exports.membershipsService = new MembershipsService();
