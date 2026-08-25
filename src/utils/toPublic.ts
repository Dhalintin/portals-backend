import {
  Class,
  type Membership,
  type Organization,
  type User,
} from "@prisma/client";
import { AppRole } from "../lib/jwt";
import { PublicUser } from "../features/auth/auth.types";
import { displayClassName, displayName } from "./displayName";
import { mapOrgRole } from "./auth/mapOrgRole";
import { ClassPublic } from "../features/classes/class.types";
import { SchoolPublic } from "../features/schools/school.types";

export type MembershipWithOrg = Membership & { organization: Organization };

export function toPublicUser(
  user: User,
  memberships: MembershipWithOrg[],
  active: {
    role: AppRole;
    schoolId: string | null;
    schoolSlug: string | null;
    schoolName: string | null;
  }
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: displayName(user),
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
      role: mapOrgRole(m.role),
      schoolName: m.organization.name,
      schoolSlug: m.organization.slug,
      isActive: m.isActive && m.organization.isActive,
    })),
  };
}

export function toClassPublic(row: Class): ClassPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    arm: row.arm,
    level: row.level,
    isActive: row.isActive,
    displayName: displayClassName(row.name, row.arm),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toSchoolPublic(org: Organization): SchoolPublic {
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
