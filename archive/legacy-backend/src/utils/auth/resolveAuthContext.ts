import {
  GlobalRole,
  OrgRole,
  type Membership,
  type Organization,
  type User,
} from "@prisma/client";
import { BadRequestError, ForbiddenError } from "../../common/errors/AppError";
import type { AppRole } from "../../features/auth/auth.types";

export type MembershipWithOrg = Membership & { organization: Organization };

export type ResolvedAuthContext = {
  role: AppRole;
  schoolId: string | null;
  schoolSlug: string | null;
  schoolName: string | null;
  membershipId: string | null;
};

type UserWithMemberships = User & {
  memberships: MembershipWithOrg[];
  globalRole: GlobalRole;
};

function mapOrgRole(role: OrgRole): AppRole {
  switch (role) {
    case OrgRole.SCHOOL_ADMIN:
      return "SCHOOL_ADMIN";
    case OrgRole.TEACHER:
      return "TEACHER";
    case OrgRole.EXAM_OFFICER:
      return "EXAM_OFFICER";
    default:
      return "TEACHER";
  }
}

function activeMemberships(user: UserWithMemberships) {
  return user.memberships.filter((m) => m.isActive && m.organization.isActive);
}

/**
 * No school slug/id (e.g. localhost:3000/login or app.portals.com/login).
 * ONLY SUPER_ADMIN or PLATFORM_ADMIN.
 */
export function resolvePlatformContext(
  user: UserWithMemberships
): ResolvedAuthContext {
  if (user.globalRole === GlobalRole.SUPER_ADMIN) {
    return {
      role: "SUPER_ADMIN",
      schoolId: null,
      schoolSlug: null,
      schoolName: null,
      membershipId: null,
    };
  }

  if (user.globalRole === GlobalRole.PLATFORM_ADMIN) {
    return {
      role: "PLATFORM_ADMIN",
      schoolId: null,
      schoolSlug: null,
      schoolName: null,
      membershipId: null,
    };
  }

  throw new ForbiddenError(
    "Only platform administrators can sign in on this URL. Use your school portal (e.g. your-school.localhost:3000)."
  );
}

/**
 * School host has a slug (e.g. grace-international.localhost:3000/login).
 * User MUST have an active membership on THAT organization.
 * Membership at another school does not grant access.
 */
export function resolveSchoolContext(
  user: UserWithMemberships,
  opts: {
    organizationId?: string;
    organizationSlug?: string;
  }
): ResolvedAuthContext {
  if (!opts.organizationId && !opts.organizationSlug) {
    throw new BadRequestError(
      "School sign-in requires organizationId or organizationSlug"
    );
  }

  const memberships = activeMemberships(user);

  let membership: MembershipWithOrg | undefined;

  if (opts.organizationId) {
    membership = memberships.find(
      (m) => m.organizationId === opts.organizationId
    );
  } else if (opts.organizationSlug) {
    const slug = opts.organizationSlug.toLowerCase().trim();
    membership = memberships.find(
      (m) => m.organization.slug.toLowerCase() === slug
    );
  }

  if (!membership) {
    throw new ForbiddenError(
      "You are not a staff member of this school and cannot sign in here"
    );
  }

  // Org role only — school portal is not for platform-only accounts unless they also have membership
  if (
    membership.role !== OrgRole.SCHOOL_ADMIN &&
    membership.role !== OrgRole.TEACHER &&
    membership.role !== OrgRole.EXAM_OFFICER
  ) {
    throw new ForbiddenError("Invalid school role for sign-in");
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
