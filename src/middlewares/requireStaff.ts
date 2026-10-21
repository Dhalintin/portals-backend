import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";

export const requireStaff: RequestHandler = (req, _res, next) => {
  if (!req.auth?.orgRole || req.auth.orgRole === "PARENT") {
    return next(new AppError(403, "FORBIDDEN", "School staff access required"));
  }
  next();
};
