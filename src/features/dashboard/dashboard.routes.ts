import { z } from 'zod';
import { sendSuccess } from '../../lib/http';
import { attendanceOverview,resultProgress } from './monitoring.service';
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { dashboardController } from "./dashboard.controller";
import { requireStaff } from "../../middlewares/requireStaff";

const dashboardRoutes = Router();

dashboardRoutes.use(authenticate, requireSchool, requireStaff);

dashboardRoutes.get('/attendance-overview',requirePermission('attendance:read'),async(req,res,next)=>{try{const period=z.enum(['day','week','term']).default('day').parse(req.query.period);sendSuccess(res,await attendanceOverview(req.auth!,period));}catch(error){next(error);}});
dashboardRoutes.get('/result-progress',requirePermission('results:read'),async(req,res,next)=>{try{const termId=z.string().uuid().parse(req.query.termId);sendSuccess(res,await resultProgress(req.auth!,termId));}catch(error){next(error);}});

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
  requirePermission("classes:read"),
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
