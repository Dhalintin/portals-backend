import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";

export function isStaffManager(role: string | null | undefined) {
  return ["PROPRIETOR", "PRINCIPAL", "SCHOOL_ADMIN"].includes(role ?? "");
}

export const requireStaffManager: RequestHandler = (req, _res, next) => {
  if (!isStaffManager(req.auth?.orgRole)) return next(new AppError(403, "FORBIDDEN", "Staff management is available to school owners, principals and school administrators only."));
  next();
};
