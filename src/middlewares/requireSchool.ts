import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";

export const requireSchool: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
  }
  if (!req.auth.schoolId) {
    return next(
      new AppError(
        403,
        "SCHOOL_CONTEXT_REQUIRED",
        "This action requires a school workspace login"
      )
    );
  }
  next();
};

/** Use inside services after requireSchool */
export function getSchoolId(req: {
  auth?: { schoolId: string | null };
}): string {
  const id = req.auth?.schoolId;
  if (!id) {
    throw new AppError(
      403,
      "SCHOOL_CONTEXT_REQUIRED",
      "School context missing"
    );
  }
  return id;
}
