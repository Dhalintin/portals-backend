import { Request, Response, NextFunction } from "express";
import { GlobalRole } from "@prisma/client";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/AppError";

type AuthedUser = {
  sub: string;
  /** Prefer this */
  globalRole?: GlobalRole | string;
  /** Fallback if your JWT still uses `role` for platform roles */
  role?: GlobalRole | string;
};

/**
 * Require JWT global role to be one of the allowed GlobalRole values.
 * Use for /platform/* routes (not school OrgRole / subdomain context).
 *
 * @example
 * router.get("/overview", authenticate, authorizeGlobal([GlobalRole.SUPER_ADMIN, GlobalRole.PLATFORM_ADMIN]), handler)
 * router.post("/admins", authenticate, authorizeGlobal([GlobalRole.SUPER_ADMIN]), handler)
 */
export function authorizeGlobal(allowed: Array<GlobalRole | string>) {
  const allowedSet = new Set(allowed.map(String));

  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user as AuthedUser | undefined;

      if (!user?.sub) {
        throw new UnauthorizedError("Authentication required");
      }

      const globalRole = (user.globalRole ?? user.role) as string | undefined;

      if (!globalRole) {
        throw new ForbiddenError("Missing global role on token");
      }

      if (!allowedSet.has(globalRole)) {
        throw new ForbiddenError("Insufficient platform permissions");
      }

      // Optional: attach normalized role for handlers
      (req as any).globalRole = globalRole;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Convenience: SUPER_ADMIN only */
export const requireSuperAdmin = authorizeGlobal([GlobalRole.SUPER_ADMIN]);

/** Convenience: SUPER_ADMIN or PLATFORM_ADMIN */
export const requirePlatformStaff = authorizeGlobal([
  GlobalRole.SUPER_ADMIN,
  GlobalRole.PLATFORM_ADMIN,
]);
