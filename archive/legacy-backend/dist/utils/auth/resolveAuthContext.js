"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePlatformContext = resolvePlatformContext;
exports.resolveSchoolContext = resolveSchoolContext;
const client_1 = require("@prisma/client");
const AppError_1 = require("../../common/errors/AppError");
function mapOrgRole(role) {
    switch (role) {
        case client_1.OrgRole.SCHOOL_ADMIN:
            return "SCHOOL_ADMIN";
        case client_1.OrgRole.TEACHER:
            return "TEACHER";
        case client_1.OrgRole.EXAM_OFFICER:
            return "EXAM_OFFICER";
        default:
            return "TEACHER";
    }
}
function activeMemberships(user) {
    return user.memberships.filter((m) => m.isActive && m.organization.isActive);
}
/**
 * No school slug/id (e.g. localhost:3000/login or app.portals.com/login).
 * ONLY SUPER_ADMIN or PLATFORM_ADMIN.
 */
function resolvePlatformContext(user) {
    if (user.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
        return {
            role: "SUPER_ADMIN",
            schoolId: null,
            schoolSlug: null,
            schoolName: null,
            membershipId: null,
        };
    }
    if (user.globalRole === client_1.GlobalRole.PLATFORM_ADMIN) {
        return {
            role: "PLATFORM_ADMIN",
            schoolId: null,
            schoolSlug: null,
            schoolName: null,
            membershipId: null,
        };
    }
    throw new AppError_1.ForbiddenError("Only platform administrators can sign in on this URL. Use your school portal (e.g. your-school.localhost:3000).");
}
/**
 * School host has a slug (e.g. grace-international.localhost:3000/login).
 * User MUST have an active membership on THAT organization.
 * Membership at another school does not grant access.
 */
function resolveSchoolContext(user, opts) {
    if (!opts.organizationId && !opts.organizationSlug) {
        throw new AppError_1.BadRequestError("School sign-in requires organizationId or organizationSlug");
    }
    const memberships = activeMemberships(user);
    let membership;
    if (opts.organizationId) {
        membership = memberships.find((m) => m.organizationId === opts.organizationId);
    }
    else if (opts.organizationSlug) {
        const slug = opts.organizationSlug.toLowerCase().trim();
        membership = memberships.find((m) => m.organization.slug.toLowerCase() === slug);
    }
    if (!membership) {
        throw new AppError_1.ForbiddenError("You are not a staff member of this school and cannot sign in here");
    }
    // Org role only — school portal is not for platform-only accounts unless they also have membership
    if (membership.role !== client_1.OrgRole.SCHOOL_ADMIN &&
        membership.role !== client_1.OrgRole.TEACHER &&
        membership.role !== client_1.OrgRole.EXAM_OFFICER) {
        throw new AppError_1.ForbiddenError("Invalid school role for sign-in");
    }
    const org = membership.organization;
    return {
        role: mapOrgRole(membership.role),
        schoolId: org.id,
        schoolSlug: org.slug,
        schoolName: org.name,
        membershipId: membership.id,
    };
}
// import { GlobalRole, type User } from "@prisma/client";
// import { AppRole } from "../../lib/jwt";
// import { BadRequestError, ForbiddenError } from "../../common/errors/AppError";
// import { mapOrgRole } from "./mapOrgRole";
// import { MembershipWithOrg } from "../toPublic";
// export function resolveAuthContext(
//   user: User & { memberships: MembershipWithOrg[] },
//   organizationId?: string
// ): {
//   role: AppRole;
//   schoolId: string | null;
//   schoolSlug: string | null;
//   schoolName: string | null;
//   membershipId: string | null;
// } {
//   console.log(user.globalRole);
//   if (
//     user.globalRole === GlobalRole.SUPER_ADMIN ||
//     user.globalRole === GlobalRole.PLATFORM_ADMIN
//   ) {
//     return {
//       role: user.globalRole,
//       schoolId: null,
//       schoolSlug: null,
//       schoolName: null,
//       membershipId: null,
//     };
//   }
//   const activeMemberships = user.memberships.filter(
//     (m) => m.isActive && m.organization.isActive
//   );
//   if (activeMemberships.length === 0) {
//     throw new ForbiddenError("No active school membership");
//   }
//   let membership: MembershipWithOrg | undefined;
//   if (organizationId) {
//     membership = activeMemberships.find(
//       (m) => m.organizationId === organizationId
//     );
//     if (!membership) {
//       throw new ForbiddenError("Not a member of that organization");
//     }
//   } else if (activeMemberships.length === 1) {
//     membership = activeMemberships[0];
//   } else {
//     throw new BadRequestError(
//       "Multiple schools found. Pass organizationId to select one.",
//       {
//         code: "ORGANIZATION_SELECTION_REQUIRED",
//         memberships: activeMemberships.map((m) => ({
//           organizationId: m.organizationId,
//           schoolName: m.organization.name,
//           schoolSlug: m.organization.slug,
//           role: mapOrgRole(m.role),
//         })),
//       }
//     );
//   }
//   return {
//     role: mapOrgRole(membership.role),
//     schoolId: membership.organizationId,
//     schoolSlug: membership.organization.slug,
//     schoolName: membership.organization.name,
//     membershipId: membership.id,
//   };
// }
