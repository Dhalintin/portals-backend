// src/types/auth.ts  (or src/lib/auth/types.ts)

export type Role =
  | "PLATFORM_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "EXAM_OFFICER";

/** User as stored in memory / localStorage after login or /auth/me */
export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string; // `${firstName} ${lastName}`
  phone: string | null;
  avatarUrl: string | null;
  role: Role; // active role for this session
  schoolId: string | null; // null for platform_admin
  schoolSlug: string | null;
  schoolName: string | null;
  globalRole: "SUPER_ADMIN" | "USER";
  memberships: SessionMembership[];
};

export type SessionMembership = {
  id: string;
  organizationId: string;
  role: Role;
  schoolName: string;
  schoolSlug: string;
  isActive: boolean;
};

/**
 * Client session = user + access token.
 * This is what AuthProvider / authStore should hold.
 */
export type Session = {
  user: SessionUser;
  token: string;
};
