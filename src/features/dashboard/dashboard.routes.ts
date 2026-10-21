import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { dashboardController } from "./dashboard.controller";
import { requireStaff } from "../../middlewares/requireStaff";

const dashboardRoutes = Router();

dashboardRoutes.use(authenticate, requireSchool, requireStaff);

// Main home dashboard
dashboardRoutes.get(
  "/home",
  requirePermission("reports:read"),
  dashboardController.home
);

// Class-level snapshot
dashboardRoutes.get(
  "/classes/:classId",
  requirePermission("reports:read"),
  dashboardController.classSnapshot
);

// Exports
dashboardRoutes.get(
  "/export",
  requirePermission("reports:export"),
  dashboardController.export
);

// PDF data
dashboardRoutes.get(
  "/report-cards/:resultId",
  requirePermission("results:read"),
  dashboardController.reportCard
);
dashboardRoutes.get(
  "/receipts/:receiptId",
  requirePermission("payments:read"),
  dashboardController.receipt
);

// Audit log
dashboardRoutes.get(
  "/audit-logs",
  requirePermission("audit:read"),
  dashboardController.auditLogs
);

export default dashboardRoutes;
