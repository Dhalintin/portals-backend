"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const attendance_controller_1 = require("./attendance.controller");
const requireStaff_1 = require("../../middlewares/requireStaff");
const attendanceRoutes = (0, express_1.Router)();
// All routes require auth + school context
attendanceRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
attendanceRoutes.get("/parent/students/:studentId", (0, requirePermission_1.requirePermission)("attendance:read"), attendance_controller_1.attendanceController.parentHistory);
attendanceRoutes.use(requireStaff_1.requireStaff);
// Teacher / admin write
attendanceRoutes.post("/mark", (0, requirePermission_1.requirePermission)("attendance:write"), attendance_controller_1.attendanceController.markClass);
attendanceRoutes.patch("/:id", (0, requirePermission_1.requirePermission)("attendance:write"), attendance_controller_1.attendanceController.updateOne);
attendanceRoutes.post("/sync", (0, requirePermission_1.requirePermission)("attendance:write"), attendance_controller_1.attendanceController.offlineSync);
// Read
attendanceRoutes.get("/class", (0, requirePermission_1.requirePermission)("attendance:read"), attendance_controller_1.attendanceController.listByClassDate);
attendanceRoutes.get("/student/:studentId", (0, requirePermission_1.requirePermission)("attendance:read"), attendance_controller_1.attendanceController.listByStudent);
attendanceRoutes.get("/absent-today", (0, requirePermission_1.requirePermission)("attendance:read"), attendance_controller_1.attendanceController.absentToday);
attendanceRoutes.get("/percentage", (0, requirePermission_1.requirePermission)("attendance:read"), attendance_controller_1.attendanceController.percentage);
exports.default = attendanceRoutes;
