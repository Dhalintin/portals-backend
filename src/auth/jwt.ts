import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AccessTokenClaims, RefreshTokenClaims } from "./types";
import { AppError } from "../lib/errors";

export function signAccessToken(
  claims: Omit<AccessTokenClaims, "typ">
): string {
  const payload: AccessTokenClaims = { ...claims, typ: "access" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
    issuer: env.APP_NAME,
    algorithm: "HS256",
  });
}

export function signRefreshToken(
  claims: Omit<RefreshTokenClaims, "typ">,
  expiresAt?: Date
): string {
  const payload = {
    ...claims,
    typ: "refresh" as const,
    ...(expiresAt ? { exp: Math.floor(expiresAt.getTime() / 1000) } : {}),
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    ...(expiresAt
      ? {}
      : { expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions["expiresIn"] }),
    issuer: env.APP_NAME,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.APP_NAME,
      algorithms: ["HS256"],
    }) as AccessTokenClaims & { exp?: number };

    if (decoded.typ !== "access" || !validSessionClaims(decoded)) {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired access token");
  }
}

export function verifyRefreshToken(
  token: string
): RefreshTokenClaims & { exp: number } {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: env.APP_NAME,
      algorithms: ["HS256"],
    }) as RefreshTokenClaims & { exp: number };
    if (
      decoded.typ !== "refresh" ||
      !validSessionClaims(decoded) ||
      typeof decoded.jti !== "string" ||
      !decoded.jti
    ) {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired refresh token");
  }
}

function validSessionClaims(claims: {
  sub?: unknown;
  sid?: unknown;
  schoolId?: unknown;
  authVersion?: unknown;
  exp?: unknown;
}) {
  return (
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.sid === "string" &&
    claims.sid.length > 0 &&
    (claims.schoolId === null ||
      (typeof claims.schoolId === "string" && claims.schoolId.length > 0)) &&
    typeof claims.authVersion === "number" &&
    Number.isSafeInteger(claims.authVersion) &&
    claims.authVersion >= 0 &&
    typeof claims.exp === "number" &&
    Number.isSafeInteger(claims.exp)
  );
}
