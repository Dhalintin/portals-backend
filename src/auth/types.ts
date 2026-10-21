import type { GlobalRole, OrgRole } from "@prisma/client";
import type { Permission } from "./permissions";
// import type { Permission } from "../../auth/permissions";

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  authVersion: number;
  globalRole: GlobalRole;
  schoolId: string | null;
  orgRole: OrgRole | null;
  permissions: Permission[];
  typ: "access";
};

export type RefreshTokenClaims = {
  sub: string;
  sid: string;
  jti: string;
  authVersion: number;
  typ: "refresh";
  /** Binds refresh to a school workspace when issued from school login */
  schoolId: string | null;
};

export type AuthContext = {
  userId: string;
  sessionId: string;
  globalRole: GlobalRole;
  schoolId: string | null;
  orgRole: OrgRole | null;
  permissions: readonly Permission[];
};
