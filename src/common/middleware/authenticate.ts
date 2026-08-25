// src/common/middleware/authenticate.ts
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../errors/AppError";
import type { JwtPayload } from "../types/jwt";

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError("Missing or invalid Authorization header")
    );
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return next(new UnauthorizedError("Missing token"));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    if (!payload?.sub || !payload?.role) {
      return next(new UnauthorizedError("Invalid token payload"));
    }
    req.user = {
      sub: payload.sub,
      role: payload.role,
      schoolId: payload.schoolId ?? null,
      email: payload.email,
    };
    next();
  } catch (err) {
    next(err);
  }
};
