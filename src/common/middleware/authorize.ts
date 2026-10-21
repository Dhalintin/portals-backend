// src/common/middleware/authorize.ts
import type { RequestHandler } from "express";
import type { Role } from "../types/auth";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth ? req.auth.orgRole ?? req.auth.globalRole : req.user?.role;
    if (!role) {
      return next(new UnauthorizedError());
    }

    const allowed: readonly string[] = roles;
    if (allowed.length && !allowed.includes(role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }
    next();
  };
}

/** School staff must be bound to a tenant */
export const requireSchoolContext: RequestHandler = (req, _res, next) => {
  if (req.auth) {
    if (!req.auth.schoolId) return next(new ForbiddenError("No school context on session"));
    return next();
  }
  if (!req.user) {
    return next(new UnauthorizedError());
  }
  if (req.user.role === "PLATFORM_ADMIN") {
    return next();
  }
  if (!req.user.schoolId) {
    return next(new ForbiddenError("No school context on token"));
  }
  next();
};
