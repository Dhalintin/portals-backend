import { z } from "zod";
import { sendSuccess } from "../../lib/http";
import { markAnnouncementRead, unreadAnnouncements } from "./announcementReads.service";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";

import { communicationController } from "./communication.controller";

const communicationRoutes = Router();

communicationRoutes.use(authenticate, requireSchool);

// Personal read tracking never accepts a user or school from the request body.
communicationRoutes.get("/announcements/unread",requirePermission("announcements:read"),async(req,res,next)=>{
 try{sendSuccess(res,await unreadAnnouncements(req.auth!.schoolId!,req.auth!.userId));}catch(error){next(error);}
});
communicationRoutes.post("/announcements/:id/read",requirePermission("announcements:read"),async(req,res,next)=>{
 try{const id=z.string().uuid().parse(req.params.id);z.object({}).strict().parse(req.body??{});sendSuccess(res,await markAnnouncementRead(req.auth!.schoolId!,req.auth!.userId,id));}catch(error){next(error);}
});

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
