// middleware/requirePlatform.ts
import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";

export const requirePlatform: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
  }

  const role = req.auth.globalRole;
  if (role !== "SUPER_ADMIN" && role !== "PLATFORM_ADMIN") {
    return next(
      new AppError(
        403,
        "PLATFORM_ONLY",
        "Platform administrator access required"
      )
    );
  }

  // Platform tokens should not carry a school context
  if (req.auth.schoolId) {
    return next(
      new AppError(403, "WRONG_CONTEXT", "Use a platform login (no school)")
    );
  }

  next();
};

/** Only SUPER_ADMIN */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.globalRole !== "SUPER_ADMIN") {
    return next(new AppError(403, "SUPER_ADMIN_ONLY", "Super admin required"));
  }
  next();
};

// import type { RequestHandler } from "express";
// import { AppError } from "../lib/errors";

// export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
//   if (!req.auth) {
//     return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
//   }
//   const role = req.auth.globalRole;
//   if (role !== "SUPER_ADMIN" && role !== "PLATFORM_ADMIN") {
//     return next(new AppError(403, "FORBIDDEN", "Platform administrators only"));
//   }
//   next();
// };

// export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
//   if (!req.auth) {
//     return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
//   }
//   if (req.auth.globalRole !== "SUPER_ADMIN") {
//     return next(new AppError(403, "FORBIDDEN", "Super admin only"));
//   }
//   next();
// };
