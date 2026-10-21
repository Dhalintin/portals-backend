import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { attendanceController } from "./attendance.controller";
import { requireStaff } from "../../middlewares/requireStaff";

const attendanceRoutes = Router();

// All routes require auth + school context
attendanceRoutes.use(authenticate, requireSchool);
attendanceRoutes.get("/parent/students/:studentId", requirePermission("attendance:read"), attendanceController.parentHistory);
attendanceRoutes.use(requireStaff);

// Teacher / admin write
attendanceRoutes.post(
  "/mark",
  requirePermission("attendance:write"),
  attendanceController.markClass
);

attendanceRoutes.patch(
  "/:id",
  requirePermission("attendance:write"),
  attendanceController.updateOne
);

attendanceRoutes.post(
  "/sync",
  requirePermission("attendance:write"),
  attendanceController.offlineSync
);

// Read
attendanceRoutes.get(
  "/class",
  requirePermission("attendance:read"),
  attendanceController.listByClassDate
);

attendanceRoutes.get(
  "/student/:studentId",
  requirePermission("attendance:read"),
  attendanceController.listByStudent
);

attendanceRoutes.get(
  "/absent-today",
  requirePermission("attendance:read"),
  attendanceController.absentToday
);

attendanceRoutes.get(
  "/percentage",
  requirePermission("attendance:read"),
  attendanceController.percentage
);

export default attendanceRoutes;
