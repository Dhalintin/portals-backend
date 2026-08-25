// src/lib/jwt.ts
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthTokenPayload, AppRole } from "../features/auth/auth.types";

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

export type { AuthTokenPayload, AppRole };
