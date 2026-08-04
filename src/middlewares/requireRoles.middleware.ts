import { Request, Response, NextFunction } from "express";
import { OrgRole, GlobalRole } from "@prisma/client";
import { customResponse } from "../utils/customResponse";

type AllowedRole = OrgRole | GlobalRole;

/**
 * requireRoles(["ADMIN", "TEACHER"])
 *
 * Checks the authenticated user's role against the allowed list.
 * Reads from req.user which your auth middleware must attach.
 *
 * A SUPER_ADMIN (either global or org-level) always passes through.
 */
export const requireRoles = (allowed: AllowedRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as
      | {
          id: string;
          role?: OrgRole; // org-scoped role (from Membership or User.role)
          globalRole?: GlobalRole;
        }
      | undefined;

    if (!user) {
      customResponse({
        status: 401,
        res,
        success: false,
        message: "Unauthorized. Please log in.",
      });
      return;
    }

    // Global SUPER_ADMIN bypasses every role check
    if (user.globalRole === "SUPER_ADMIN") {
      next();
      return;
    }

    // Org-level SUPER_ADMIN also bypasses
    if (user.role === "SUPER_ADMIN") {
      next();
      return;
    }

    const hasRole =
      (user.role && allowed.includes(user.role)) ||
      (user.globalRole && allowed.includes(user.globalRole));

    if (!hasRole) {
      customResponse({
        status: 403,
        res,
        success: false,
        message:
          "Forbidden. You do not have permission to perform this action.",
      });
      return;
    }

    next();
  };
};

export const orgRequireRoles = (allowedRoles: OrgRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as
      | { id: string; globalRole?: GlobalRole }
      | undefined;
    const membership = (req as any).membership as { role: OrgRole } | undefined;

    // Safety checks
    if (!user) {
      customResponse({
        status: 401,
        res,
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (!membership) {
      customResponse({
        status: 403,
        res,
        success: false,
        message: "You are not a member of this organization",
      });
      return;
    }

    // Global SUPER_ADMIN bypass (optional but powerful)
    if (user.globalRole === "SUPER_ADMIN") {
      return next();
    }

    // Check if user's OrgRole is allowed
    const hasAllowedRole = allowedRoles.includes(membership.role);

    if (!hasAllowedRole) {
      customResponse({
        status: 403,
        res,
        success: false,
        message: "You do not have the required role to perform this action.",
      });
      return;
    }

    next();
  };
};
