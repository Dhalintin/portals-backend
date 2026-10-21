// src/lib/jwt.ts
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthTokenPayload, AppRole } from "../features/auth/auth.types";
const jwtSecret: string = process.env.JWT_SECRET || "";

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: "14d" });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, jwtSecret) as AuthTokenPayload;
}

export type { AuthTokenPayload, AppRole };
