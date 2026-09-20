"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapOrgRole = mapOrgRole;
const client_1 = require("@prisma/client");
function mapOrgRole(role) {
    switch (role) {
        case client_1.OrgRole.SCHOOL_ADMIN:
            return "SCHOOL_ADMIN";
        case client_1.OrgRole.TEACHER:
            return "TEACHER";
        case client_1.OrgRole.EXAM_OFFICER:
            return "EXAM_OFFICER";
        default:
            return "TEACHER";
    }
}
