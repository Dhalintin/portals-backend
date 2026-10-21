import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";
import { hasAllPermissions } from "../auth/rbac";
import type { Permission } from "../auth/permissions";

export function requirePermission(...needed: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }

    if (!hasAllPermissions(req.auth.permissions, needed)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission for this action"
        )
      );
    }
    next();
  };
}
