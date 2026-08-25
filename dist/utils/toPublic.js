"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
exports.toClassPublic = toClassPublic;
exports.toSchoolPublic = toSchoolPublic;
const displayName_1 = require("./displayName");
const mapOrgRole_1 = require("./auth/mapOrgRole");
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
function toClassPublic(row) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        arm: row.arm,
        level: row.level,
        isActive: row.isActive,
        displayName: (0, displayName_1.displayClassName)(row.name, row.arm),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function toSchoolPublic(org) {
    return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        motto: org.motto,
        schoolType: org.schoolType,
        isActive: org.isActive,
        onBoarded: org.onBoarded,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
    };
}
