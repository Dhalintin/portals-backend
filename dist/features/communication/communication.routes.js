"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const http_1 = require("../../lib/http");
const announcementReads_service_1 = require("./announcementReads.service");
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const communication_controller_1 = require("./communication.controller");
const communicationRoutes = (0, express_1.Router)();
communicationRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
// Personal read tracking never accepts a user or school from the request body.
communicationRoutes.get("/announcements/unread", (0, requirePermission_1.requirePermission)("announcements:read"), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await (0, announcementReads_service_1.unreadAnnouncements)(req.auth.schoolId, req.auth.userId));
    }
    catch (error) {
        next(error);
    }
});
communicationRoutes.post("/announcements/:id/read", (0, requirePermission_1.requirePermission)("announcements:read"), async (req, res, next) => {
    try {
        const id = zod_1.z.string().uuid().parse(req.params.id);
        zod_1.z.object({}).strict().parse(req.body ?? {});
        (0, http_1.sendSuccess)(res, await (0, announcementReads_service_1.markAnnouncementRead)(req.auth.schoolId, req.auth.userId, id));
    }
    catch (error) {
        next(error);
    }
});
// Announcements
communicationRoutes.post("/announcements", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.createAnnouncement);
communicationRoutes.patch("/announcements/:id/publish", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.publishAnnouncement);
communicationRoutes.get("/announcements", (0, requirePermission_1.requirePermission)("announcements:read"), communication_controller_1.communicationController.listAnnouncements);
communicationRoutes.get("/announcements/:id", (0, requirePermission_1.requirePermission)("announcements:read"), communication_controller_1.communicationController.getAnnouncement);
communicationRoutes.patch("/announcements/:id", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.updateAnnouncement);
communicationRoutes.delete("/announcements/:id", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.deleteAnnouncement);
// Outbox (admin)
communicationRoutes.post("/notifications", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.enqueue);
communicationRoutes.get("/notifications/outbox", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.listOutbox);
communicationRoutes.post("/notifications/process", (0, requirePermission_1.requirePermission)("announcements:write"), communication_controller_1.communicationController.processOutbox);
exports.default = communicationRoutes;
