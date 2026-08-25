"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
const displayName_1 = require("../displayName");
const mapOrgRole_1 = require("./mapOrgRole");
function toPublicUser(user, memberships, active) {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: (0, displayName_1.displayName)(user),
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: active.role,
        schoolId: active.schoolId,
        schoolSlug: active.schoolSlug,
        schoolName: active.schoolName,
        globalRole: user.globalRole,
        memberships: memberships.map((m) => ({
            id: m.id,
            organizationId: m.organizationId,
            role: (0, mapOrgRole_1.mapOrgRole)(m.role),
            schoolName: m.organization.name,
            schoolSlug: m.organization.slug,
            isActive: m.isActive && m.organization.isActive,
        })),
    };
}
