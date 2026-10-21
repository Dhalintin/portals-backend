"use strict";
// import { Request, Response, NextFunction } from "express";
// import { OrgRole, GlobalRole } from "@prisma/client";
// import { customResponse } from "../utils/customResponse";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = void 0;
exports.permissionsForOrgRole = permissionsForOrgRole;
const permissions_1 = require("../auth/permissions");
// import { PERMISSIONS, type Permission } from "./permissions";
const allSchoolOps = Object.values(permissions_1.PERMISSIONS);
exports.ROLE_PERMISSIONS = {
    PROPRIETOR: allSchoolOps,
    PRINCIPAL: [
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
        permissions_1.PERMISSIONS["announcements:write"],
        permissions_1.PERMISSIONS["reports:read"],
        permissions_1.PERMISSIONS["settings:write"],
        permissions_1.PERMISSIONS["fees:read"],
        permissions_1.PERMISSIONS["payments:read"],
    ],
    BURSAR: [
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["fees:read"],
        permissions_1.PERMISSIONS["fees:write"],
        permissions_1.PERMISSIONS["payments:read"],
        permissions_1.PERMISSIONS["payments:write"],
        permissions_1.PERMISSIONS["reports:read"],
        permissions_1.PERMISSIONS["parents:read"],
    ],
    SCHOOL_ADMIN: allSchoolOps, // legacy Portals admin
    TEACHER: [
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["classes:read"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["results:write"],
        permissions_1.PERMISSIONS["attendance:read"],
        permissions_1.PERMISSIONS["attendance:write"],
    ],
    EXAM_OFFICER: [
        permissions_1.PERMISSIONS["students:read"],
        permissions_1.PERMISSIONS["classes:read"],
        permissions_1.PERMISSIONS["results:read"],
        permissions_1.PERMISSIONS["results:write"],
        permissions_1.PERMISSIONS["results:publish"],
        permissions_1.PERMISSIONS["reports:read"],
    ],
    PARENT: [
        permissions_1.PERMISSIONS["results:read"], // scoped to own children in service
        permissions_1.PERMISSIONS["fees:read"],
        permissions_1.PERMISSIONS["payments:read"],
        permissions_1.PERMISSIONS["attendance:read"],
    ],
    STAFF: [permissions_1.PERMISSIONS["students:read"], permissions_1.PERMISSIONS["attendance:read"]],
};
function permissionsForOrgRole(role) {
    return exports.ROLE_PERMISSIONS[role] ?? [];
}
