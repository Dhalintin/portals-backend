"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapOrgRole = mapOrgRole;
const client_1 = require("@prisma/client");
function mapOrgRole(role) {
    switch (role) {
        case client_1.OrgRole.SCHOOL_ADMIN:
            return "school_admin";
        case client_1.OrgRole.TEACHER:
            return "teacher";
        case client_1.OrgRole.EXAM_OFFICER:
            return "exam_officer";
        default:
            return "teacher";
    }
}
