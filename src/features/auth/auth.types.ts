import type { GlobalRole, OrgRole } from "@prisma/client";
import type { Permission } from "../../auth/permissions";

export type AccessTokenClaims = {
  sub: string;
  globalRole: GlobalRole;
  schoolId: string | null;
  orgRole: OrgRole | null;
  permissions: Permission[];
  typ: "access";
};

export type RefreshTokenClaims = {
  sub: string;
  typ: "refresh";
  /** Binds refresh to a school workspace when issued from school login */
  schoolId: string | null;
};

export type AuthContext = {
  userId: string;
  globalRole: GlobalRole;
  schoolId: string | null;
  orgRole: OrgRole | null;
  permissions: readonly Permission[];
};

// // src/features/auth/auth.types.ts
export type AppRole =
  | "SUPER_ADMIN"
  | "PLATFORM_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "EXAM_OFFICER";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: AppRole;
  schoolId: string | null;
  membershipId?: string | null;
  globalRole?: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
};

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: AppRole;
  schoolId: string | null;
  schoolSlug: string | null;
  schoolName: string | null;
  globalRole: "SUPER_ADMIN" | "PLATFORM_ADMIN" | "USER";
  memberships: Array<{
    id: string;
    organizationId: string;
    role: AppRole;
    schoolName: string;
    schoolSlug: string;
    isActive: boolean;
  }>;
};
