import { GlobalRole, type User } from "@prisma/client";

import { AppRole } from "../../lib/jwt";
import { BadRequestError, ForbiddenError } from "../../common/errors/AppError";
import { mapOrgRole } from "./mapOrgRole";
import { MembershipWithOrg } from "../toPublic";

export function resolveAuthContext(
  user: User & { memberships: MembershipWithOrg[] },
  organizationId?: string
): {
  role: AppRole;
  schoolId: string | null;
  schoolSlug: string | null;
  schoolName: string | null;
  membershipId: string | null;
} {
  console.log(user.globalRole);
  if (
    user.globalRole === GlobalRole.SUPER_ADMIN ||
    user.globalRole === GlobalRole.PLATFORM_ADMIN
  ) {
    return {
      role: user.globalRole,
      schoolId: null,
      schoolSlug: null,
      schoolName: null,
      membershipId: null,
    };
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.isActive && m.organization.isActive
  );

  if (activeMemberships.length === 0) {
    throw new ForbiddenError("No active school membership");
  }

  let membership: MembershipWithOrg | undefined;

  if (organizationId) {
    membership = activeMemberships.find(
      (m) => m.organizationId === organizationId
    );
    if (!membership) {
      throw new ForbiddenError("Not a member of that organization");
    }
  } else if (activeMemberships.length === 1) {
    membership = activeMemberships[0];
  } else {
    throw new BadRequestError(
      "Multiple schools found. Pass organizationId to select one.",
      {
        code: "ORGANIZATION_SELECTION_REQUIRED",
        memberships: activeMemberships.map((m) => ({
          organizationId: m.organizationId,
          schoolName: m.organization.name,
          schoolSlug: m.organization.slug,
          role: mapOrgRole(m.role),
        })),
      }
    );
  }

  return {
    role: mapOrgRole(membership.role),
    schoolId: membership.organizationId,
    schoolSlug: membership.organization.slug,
    schoolName: membership.organization.name,
    membershipId: membership.id,
  };
}
