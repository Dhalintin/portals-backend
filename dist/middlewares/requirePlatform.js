"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSuperAdmin = exports.requirePlatform = void 0;
const errors_1 = require("../lib/errors");
const requirePlatform = (req, _res, next) => {
    if (!req.auth) {
        return next(new errors_1.AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    const role = req.auth.globalRole;
    if (role !== "SUPER_ADMIN" && role !== "PLATFORM_ADMIN") {
        return next(new errors_1.AppError(403, "PLATFORM_ONLY", "Platform administrator access required"));
    }
    // Platform tokens should not carry a school context
    if (req.auth.schoolId) {
        return next(new errors_1.AppError(403, "WRONG_CONTEXT", "Use a platform login (no school)"));
    }
    next();
};
exports.requirePlatform = requirePlatform;
/** Only SUPER_ADMIN */
const requireSuperAdmin = (req, _res, next) => {
    if (req.auth?.globalRole !== "SUPER_ADMIN") {
        return next(new errors_1.AppError(403, "SUPER_ADMIN_ONLY", "Super admin required"));
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
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
