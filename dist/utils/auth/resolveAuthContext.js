"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAuthContext = resolveAuthContext;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../common/errors/AppError");
const mapOrgRole_1 = require("./mapOrgRole");
function resolveAuthContext(user, organizationId) {
    if (user.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
        return {
            role: "platform_admin",
            schoolId: null,
            schoolSlug: null,
            schoolName: null,
            membershipId: null,
        };
    }
    const activeMemberships = user.memberships.filter((m) => m.isActive && m.organization.isActive);
    if (activeMemberships.length === 0) {
        throw new AppError_1.ForbiddenError("No active school membership");
    }
    let membership;
    if (organizationId) {
        membership = activeMemberships.find((m) => m.organizationId === organizationId);
        if (!membership) {
            throw new AppError_1.ForbiddenError("Not a member of that organization");
        }
    }
    else if (activeMemberships.length === 1) {
        membership = activeMemberships[0];
    }
    else {
        throw new AppError_1.BadRequestError("Multiple schools found. Pass organizationId to select one.", {
            code: "ORGANIZATION_SELECTION_REQUIRED",
            memberships: activeMemberships.map((m) => ({
                organizationId: m.organizationId,
                schoolName: m.organization.name,
                schoolSlug: m.organization.slug,
                role: (0, mapOrgRole_1.mapOrgRole)(m.role),
            })),
        });
    }
    return {
        role: (0, mapOrgRole_1.mapOrgRole)(membership.role),
        schoolId: membership.organizationId,
        schoolSlug: membership.organization.slug,
        schoolName: membership.organization.name,
        membershipId: membership.id,
    };
}
