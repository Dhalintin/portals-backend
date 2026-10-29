"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rbac_1 = require("../../auth/rbac");
const requireStaffManager_1 = require("../../middlewares/requireStaffManager");
const errors_1 = require("../../lib/errors");
const prisma_1 = require("../../lib/prisma");
const requireStaff_1 = require("../../middlewares/requireStaff");
const staffImport_1 = require("../imports/staffImport");
const http_1 = require("../../lib/http");
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const rateLimit_1 = require("../../middlewares/rateLimit");
const memberships_validation_1 = require("../memberships/memberships.validation");
const staff_controller_1 = require("./staff.controller");
const c = new staff_controller_1.StaffController();
const staffRoutes = (0, express_1.Router)();
staffRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
staffRoutes.get("/me", requireStaff_1.requireStaff, async (req, res, next) => {
    try {
        const organizationId = req.auth.schoolId, userId = req.auth.userId;
        const membership = await prisma_1.prisma.membership.findFirst({ where: { organizationId, userId, isActive: true, user: { isActive: true } },
            select: { id: true, role: true, roles: true, joinedAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } } });
        if (!membership)
            throw new errors_1.AppError(403, "FORBIDDEN", "Your staff record is unavailable.");
        const [classes, subjects] = await Promise.all([
            prisma_1.prisma.class.findMany({ where: { organizationId, isActive: true, classTeacherId: userId }, select: { id: true, name: true, arm: true } }),
            prisma_1.prisma.classSubjectTeacher.findMany({ where: { organizationId, userId, class: { isActive: true }, subject: { isActive: true } }, select: { class: { select: { id: true, name: true, arm: true } }, subject: { select: { id: true, name: true } } } }),
        ]);
        (0, http_1.sendSuccess)(res, { membershipId: membership.id, role: membership.role, roles: (0, rbac_1.membershipRoles)(membership), joinedAt: membership.joinedAt, user: membership.user, classTeacherOf: classes, assignments: subjects });
    }
    catch (error) {
        next(error);
    }
});
staffRoutes.get("/me/assignments", requireStaff_1.requireStaff, async (req, res, next) => {
    try {
        const organizationId = req.auth.schoolId, userId = req.auth.userId;
        const [classes, subjects] = await Promise.all([
            prisma_1.prisma.class.findMany({ where: { organizationId, isActive: true, classTeacherId: userId }, orderBy: { name: "asc" } }),
            prisma_1.prisma.classSubjectTeacher.findMany({ where: { organizationId, userId, class: { isActive: true }, subject: { isActive: true } }, include: { class: true, subject: true } }),
        ]);
        (0, http_1.sendSuccess)(res, { classTeacherOf: classes.map(c => ({ id: c.id, name: c.name, arm: c.arm })), assignments: subjects.map(a => ({ classId: a.classId, className: a.class.name, classArm: a.class.arm, subjectId: a.subjectId, subjectName: a.subject.name })) });
    }
    catch (error) {
        next(error);
    }
});
staffRoutes.get("/", requireStaffManager_1.requireStaffManager, (0, requirePermission_1.requirePermission)("staff:read"), c.list);
const inviteStaffSchema = memberships_validation_1.createMembershipSchema.refine(input => input.role !== "PARENT", { path: ["role"], message: "Use parent invitations for parent access" });
staffRoutes.post("/", requireStaffManager_1.requireStaffManager, (0, requirePermission_1.requirePermission)("staff:write"), rateLimit_1.invitationLimiter, (0, validate_1.validate)(inviteStaffSchema), c.invite);
staffRoutes.patch('/invitations/:id/role', requireStaffManager_1.requireStaffManager, (0, requirePermission_1.requirePermission)('memberships:write'), async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, staffImport_1.updatePendingStaffRole)(req.auth.schoolId, req.auth.userId, req.params.id, req.body));
}
catch (error) {
    next(error);
} });
exports.default = staffRoutes;
