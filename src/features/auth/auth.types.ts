// src/features/auth/auth.types.ts
export type AppRole =
  | "platform_admin"
  | "school_admin"
  | "teacher"
  | "exam_officer";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: AppRole;
  schoolId: string | null;
  membershipId?: string | null;
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
  globalRole: "SUPER_ADMIN" | "USER";
  memberships: Array<{
    id: string;
    organizationId: string;
    role: AppRole;
    schoolName: string;
    schoolSlug: string;
    isActive: boolean;
  }>;
};
