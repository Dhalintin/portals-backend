// src/common/types/jwt.ts
import type { Role } from "../types/auth"; // or define Role here

export type JwtPayload = {
  sub: string;
  role: Role;
  schoolId: string | null;
  email?: string;
  membershipId?: string | null;
};
