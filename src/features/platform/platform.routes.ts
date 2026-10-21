import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import {
  requirePlatform,
  requireSuperAdmin,
} from "../../middlewares/requirePlatform";
import { platformController } from "./platform.controller";

const platformRoutes = Router();

// All platform routes require a platform-scoped token
platformRoutes.use(authenticate, requirePlatform);

// Metrics
platformRoutes.get("/metrics", platformController.metrics);

// Schools
platformRoutes.get("/schools", platformController.listSchools);
platformRoutes.get("/schools/:id", platformController.getSchool);
platformRoutes.patch("/schools/:id/status", platformController.setSchoolStatus);
platformRoutes.patch(
  "/schools/:id/subscription",
  platformController.updateSubscription
);

// Platform admin assignments
platformRoutes.get("/admins", platformController.listAdmins);
platformRoutes.post("/admins", platformController.assignAdmin);
platformRoutes.delete(
  "/admins/:userId/:organizationId",
  platformController.removeAdmin
);

// Create platform users (SUPER_ADMIN only)
platformRoutes.post(
  "/users",
  requireSuperAdmin,
  platformController.createPlatformUser
);

export default platformRoutes;
