"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = void 0;
exports.permissionsForOrgRole = permissionsForOrgRole;
exports.hasAllPermissions = hasAllPermissions;
exports.principalCanManageRole = principalCanManageRole;
const permissions_1 = require("./permissions");
exports.ROLE_PERMISSIONS = {
    PROPRIETOR: permissions_1.ALL_PERMISSIONS,
    SCHOOL_ADMIN: permissions_1.ALL_PERMISSIONS,
    PRINCIPAL: [
        permissions_1.PERMISSIONS["exams:read"], permissions_1.PERMISSIONS["exams:write"], permissions_1.PERMISSIONS["exams:publish"],
        permissions_1.PERMISSIONS["announcements:read"],
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["students:write"],
        permissions_1.PERMISSIONS["classes:read"],
        permissions_1.PERMISSIONS["classes:write"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["results:write"],
        permissions_1.PERMISSIONS["results:publish"],
        permissions_1.PERMISSIONS["attendance:read"],
        permissions_1.PERMISSIONS["attendance:write"],
        permissions_1.PERMISSIONS["parents:read"],
        permissions_1.PERMISSIONS["parents:write"],
        permissions_1.PERMISSIONS["staff:read"],
        permissions_1.PERMISSIONS["staff:write"],
        permissions_1.PERMISSIONS["announcements:write"],
        permissions_1.PERMISSIONS["reports:read"],
        permissions_1.PERMISSIONS["reports:export"],
        permissions_1.PERMISSIONS["settings:write"],
        permissions_1.PERMISSIONS["memberships:read"],
        permissions_1.PERMISSIONS["memberships:write"],
    ],
    BURSAR: [
        permissions_1.PERMISSIONS["announcements:read"],
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["fees:read"],
        permissions_1.PERMISSIONS["fees:write"],
        permissions_1.PERMISSIONS["payments:read"],
        permissions_1.PERMISSIONS["payments:write"],
        permissions_1.PERMISSIONS["reports:read"],
        permissions_1.PERMISSIONS["parents:read"],
    ],
    TEACHER: [
        permissions_1.PERMISSIONS["exams:read"],
        permissions_1.PERMISSIONS["announcements:read"],
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["classes:read"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["results:write"],
        permissions_1.PERMISSIONS["attendance:read"],
        permissions_1.PERMISSIONS["attendance:write"],
    ],
    EXAM_OFFICER: [
        permissions_1.PERMISSIONS["exams:read"], permissions_1.PERMISSIONS["exams:write"], permissions_1.PERMISSIONS["exams:publish"],
        permissions_1.PERMISSIONS["announcements:read"],
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["classes:read"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["results:write"],
        permissions_1.PERMISSIONS["results:publish"],
        permissions_1.PERMISSIONS["reports:read"],
    ],
    PARENT: [
        permissions_1.PERMISSIONS["exams:read"],
        permissions_1.PERMISSIONS["announcements:read"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["fees:read"],
        permissions_1.PERMISSIONS["payments:read"],
        permissions_1.PERMISSIONS["attendance:read"],
    ],
    STAFF: [permissions_1.PERMISSIONS["students:read"], permissions_1.PERMISSIONS["attendance:read"], permissions_1.PERMISSIONS["announcements:read"]],
};
function permissionsForOrgRole(role) {
    return [...(exports.ROLE_PERMISSIONS[role] ?? [])];
}
function hasAllPermissions(granted, needed) {
    const set = new Set(granted);
    return needed.every((p) => set.has(p));
}
// A principal can manage academic staff without granting finance/admin access.
function principalCanManageRole(role) {
    return ["PRINCIPAL", "TEACHER", "EXAM_OFFICER", "STAFF", "PARENT"].includes(role);
}
