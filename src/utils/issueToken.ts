import { User } from "@prisma/client";
import { resolveAuthContext } from "./auth/resolveAuthContext";
import { AuthTokenPayload, signAccessToken } from "../lib/jwt";

export function issueToken(
  user: User,
  ctx: ReturnType<typeof resolveAuthContext>
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
