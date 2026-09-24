import { User } from "@prisma/client";
import { ResolvedAuthContext } from "./auth/resolveAuthContext";
import { AuthTokenPayload, signAccessToken } from "../lib/jwt";

export function issueToken(
  user: User,
  ctx: ResolvedAuthContext
): { token: string; payload: AuthTokenPayload } {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: ctx.role,
    schoolId: ctx.schoolId,
    membershipId: ctx.membershipId,
  };
  return { token: signAccessToken(payload), payload };
}
