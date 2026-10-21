import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";

import { communicationController } from "./communication.controller";

const communicationRoutes = Router();

communicationRoutes.use(authenticate, requireSchool);

// Announcements
communicationRoutes.post(
  "/announcements",
  requirePermission("announcements:write"),
  communicationController.createAnnouncement
);

communicationRoutes.patch(
  "/announcements/:id/publish",
  requirePermission("announcements:write"),
  communicationController.publishAnnouncement
);

communicationRoutes.get(
  "/announcements",
  requirePermission("announcements:read"),
  communicationController.listAnnouncements
);
communicationRoutes.get(
  "/announcements/:id",
  requirePermission("announcements:read"),
  communicationController.getAnnouncement
);
communicationRoutes.patch(
  "/announcements/:id",
  requirePermission("announcements:write"),
  communicationController.updateAnnouncement
);
communicationRoutes.delete(
  "/announcements/:id",
  requirePermission("announcements:write"),
  communicationController.deleteAnnouncement
);

// Outbox (admin)
communicationRoutes.post(
  "/notifications",
  requirePermission("announcements:write"),
  communicationController.enqueue
);
communicationRoutes.get(
  "/notifications/outbox",
  requirePermission("announcements:write"),
  communicationController.listOutbox
);
communicationRoutes.post(
  "/notifications/process",
  requirePermission("announcements:write"),
  communicationController.processOutbox
);

export default communicationRoutes;
