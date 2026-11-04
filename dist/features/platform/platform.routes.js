"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const billingAdmin_routes_1 = require("./billingAdmin.routes");
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requirePlatform_1 = require("../../middlewares/requirePlatform");
const platform_controller_1 = require("./platform.controller");
const platformRoutes = (0, express_1.Router)();
// All platform routes require a platform-scoped token
platformRoutes.use(authenticate_1.authenticate, requirePlatform_1.requirePlatform);
platformRoutes.use(billingAdmin_routes_1.billingAdminRoutes);
// Metrics
platformRoutes.get("/metrics", platform_controller_1.platformController.metrics);
// Schools
platformRoutes.get("/schools", platform_controller_1.platformController.listSchools);
platformRoutes.get("/schools/:id", platform_controller_1.platformController.getSchool);
platformRoutes.patch("/schools/:id/status", platform_controller_1.platformController.setSchoolStatus);
platformRoutes.patch("/schools/:id/subscription", (_req, res) => res.status(410).json({ success: false, error: { code: "LEGACY_BILLING_RETIRED", message: "Use term subscription bills and verified payments." } }));
// Platform admin assignments
platformRoutes.get("/admins", platform_controller_1.platformController.listAdmins);
platformRoutes.post("/admins", requirePlatform_1.requireSuperAdmin, platform_controller_1.platformController.assignAdmin);
platformRoutes.delete("/admins/:userId/:organizationId", requirePlatform_1.requireSuperAdmin, platform_controller_1.platformController.removeAdmin);
// Create platform users (SUPER_ADMIN only)
platformRoutes.post("/users", requirePlatform_1.requireSuperAdmin, platform_controller_1.platformController.createPlatformUser);
exports.default = platformRoutes;
