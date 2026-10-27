"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const http_1 = require("../../lib/http");
const monitoring_service_1 = require("./monitoring.service");
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const dashboard_controller_1 = require("./dashboard.controller");
const requireStaff_1 = require("../../middlewares/requireStaff");
const dashboardRoutes = (0, express_1.Router)();
dashboardRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool, requireStaff_1.requireStaff);
dashboardRoutes.get('/attendance-overview', (0, requirePermission_1.requirePermission)('attendance:read'), async (req, res, next) => { try {
    const period = zod_1.z.enum(['day', 'week', 'term']).default('day').parse(req.query.period);
    (0, http_1.sendSuccess)(res, await (0, monitoring_service_1.attendanceOverview)(req.auth, period));
}
catch (error) {
    next(error);
} });
dashboardRoutes.get('/result-progress', (0, requirePermission_1.requirePermission)('results:read'), async (req, res, next) => { try {
    const termId = zod_1.z.string().uuid().parse(req.query.termId);
    (0, http_1.sendSuccess)(res, await (0, monitoring_service_1.resultProgress)(req.auth, termId));
}
catch (error) {
    next(error);
} });
// Main home dashboard
dashboardRoutes.get("/home", (0, requirePermission_1.requirePermission)("reports:read"), dashboard_controller_1.dashboardController.home);
// Class-level snapshot
dashboardRoutes.get("/classes/:classId", (0, requirePermission_1.requirePermission)("reports:read"), dashboard_controller_1.dashboardController.classSnapshot);
// Exports
dashboardRoutes.get("/export", (0, requirePermission_1.requirePermission)("reports:export"), dashboard_controller_1.dashboardController.export);
// PDF data
dashboardRoutes.get("/report-cards/:resultId", (0, requirePermission_1.requirePermission)("results:read"), dashboard_controller_1.dashboardController.reportCard);
dashboardRoutes.get("/receipts/:receiptId", (0, requirePermission_1.requirePermission)("payments:read"), dashboard_controller_1.dashboardController.receipt);
// Audit log
dashboardRoutes.get("/audit-logs", (0, requirePermission_1.requirePermission)("audit:read"), dashboard_controller_1.dashboardController.auditLogs);
exports.default = dashboardRoutes;
