import type { OrgRole } from "@prisma/client";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "./permissions";

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  PROPRIETOR: ALL_PERMISSIONS,
  SCHOOL_ADMIN: ALL_PERMISSIONS,
  PRINCIPAL: [
    PERMISSIONS["announcements:read"],
    PERMISSIONS["students:read"],
    PERMISSIONS["students:write"],
    PERMISSIONS["classes:read"],
    PERMISSIONS["classes:write"],
    PERMISSIONS["results:read"],
    PERMISSIONS["results:write"],
    PERMISSIONS["results:publish"],
    PERMISSIONS["attendance:read"],
    PERMISSIONS["attendance:write"],
    PERMISSIONS["parents:read"],
    PERMISSIONS["parents:write"],
    PERMISSIONS["staff:read"],
    PERMISSIONS["staff:write"],
    PERMISSIONS["announcements:write"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["settings:write"],
    PERMISSIONS["fees:read"],
    PERMISSIONS["payments:read"],
    PERMISSIONS["memberships:read"],
    PERMISSIONS["memberships:write"],
    PERMISSIONS["audit:read"],
  ],
  BURSAR: [
    PERMISSIONS["announcements:read"],
    PERMISSIONS["students:read"],
    PERMISSIONS["fees:read"],
    PERMISSIONS["fees:write"],
    PERMISSIONS["payments:read"],
    PERMISSIONS["payments:write"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["parents:read"],
  ],
  TEACHER: [
    PERMISSIONS["announcements:read"],
    PERMISSIONS["students:read"],
    PERMISSIONS["classes:read"],
    PERMISSIONS["results:read"],
    PERMISSIONS["results:write"],
    PERMISSIONS["attendance:read"],
    PERMISSIONS["attendance:write"],
  ],
  EXAM_OFFICER: [
    PERMISSIONS["announcements:read"],
    PERMISSIONS["students:read"],
    PERMISSIONS["classes:read"],
    PERMISSIONS["results:read"],
    PERMISSIONS["results:write"],
    PERMISSIONS["results:publish"],
    PERMISSIONS["reports:read"],
  ],
  PARENT: [
    PERMISSIONS["announcements:read"],
    PERMISSIONS["results:read"],
    PERMISSIONS["fees:read"],
    PERMISSIONS["payments:read"],
    PERMISSIONS["attendance:read"],
  ],
  STAFF: [PERMISSIONS["students:read"], PERMISSIONS["attendance:read"], PERMISSIONS["announcements:read"]],
};

export function permissionsForOrgRole(role: OrgRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function hasAllPermissions(
  granted: readonly string[],
  needed: readonly Permission[]
): boolean {
  const set = new Set(granted);
  return needed.every((p) => set.has(p));
}
