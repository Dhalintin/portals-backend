"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_PERMISSIONS = exports.PERMISSIONS = void 0;
exports.PERMISSIONS = {
    "students:read": "students:read",
    "students:write": "students:write",
    "classes:read": "classes:read",
    "classes:write": "classes:write",
    "results:read": "results:read",
    "results:write": "results:write",
    "results:publish": "results:publish",
    "attendance:read": "attendance:read",
    "attendance:write": "attendance:write",
    "fees:read": "fees:read",
    "fees:write": "fees:write",
    "payments:read": "payments:read",
    "payments:write": "payments:write",
    "parents:read": "parents:read",
    "parents:write": "parents:write",
    "staff:read": "staff:read",
    "staff:write": "staff:write",
    "announcements:write": "announcements:write",
    "settings:write": "settings:write",
    "reports:read": "reports:read",
    "audit:read": "audit:read",
    "memberships:read": "memberships:read",
    "memberships:write": "memberships:write",
    "announcements:read": "announcements:read",
    "reports:export": "reports:export",
};
exports.ALL_PERMISSIONS = Object.values(exports.PERMISSIONS);
// // packages/constants or api/src/auth/permissions.ts
// export const PERMISSIONS = {
//   // students
//   "students:read": "students:read",
//   "students:write": "students:write",
//   // academics
//   "classes:read": "classes:read",
//   "classes:write": "classes:write",
//   "results:read": "results:read",
//   "results:write": "results:write",
//   "results:publish": "results:publish",
//   // attendance
//   "attendance:read": "attendance:read",
//   "attendance:write": "attendance:write",
//   // finance
//   "fees:read": "fees:read",
//   "fees:write": "fees:write",
//   "payments:read": "payments:read",
//   "payments:write": "payments:write",
//   // people
//   "parents:read": "parents:read",
//   "parents:write": "parents:write",
//   "staff:read": "staff:read",
//   "staff:write": "staff:write",
//   // comms / settings
//   "announcements:write": "announcements:write",
//   "settings:write": "settings:write",
//   "reports:read": "reports:read",
//   "audit:read": "audit:read",
// } as const;
// export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
