"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communicationController = exports.CommunicationController = void 0;
const communication_service_1 = require("./communication.service");
const communication_validation_1 = require("./communication.validation");
const http_1 = require("../../lib/http");
// import { sendSuccess } from "../lib/http";
class CommunicationController {
    createAnnouncement = async (req, res, next) => {
        try {
            const input = communication_validation_1.createAnnouncementSchema.parse(req.body);
            const data = await communication_service_1.communicationService.createAnnouncement(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    publishAnnouncement = async (req, res, next) => {
        try {
            const data = await communication_service_1.communicationService.publishAnnouncement(req.params.id, req.auth.schoolId, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    listAnnouncements = async (req, res, next) => {
        try {
            const query = communication_validation_1.listAnnouncementsQuerySchema.parse(req.query);
            const data = await communication_service_1.communicationService.listAnnouncements(req.auth.schoolId, {
                isAdmin: req.auth.permissions.includes("announcements:write"),
                activeOnly: query.activeOnly,
                limit: query.limit,
            });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getAnnouncement = async (req, res, next) => {
        try {
            const data = await communication_service_1.communicationService.getAnnouncement(req.params.id, req.auth.schoolId, req.auth.orgRole === "SCHOOL_ADMIN" ||
                req.auth.orgRole === "PROPRIETOR" ||
                req.auth.orgRole === "PRINCIPAL");
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    updateAnnouncement = async (req, res, next) => {
        try {
            const input = communication_validation_1.updateAnnouncementSchema.parse(req.body);
            const data = await communication_service_1.communicationService.updateAnnouncement(req.params.id, req.auth.schoolId, {
                title: input.title,
                body: input.body,
                isPinned: input.isPinned,
                isActive: input.isActive,
                publishAt: input.publishAt,
                expiresAt: input.expiresAt,
            }, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    deleteAnnouncement = async (req, res, next) => {
        try {
            const data = await communication_service_1.communicationService.deleteAnnouncement(req.params.id, req.auth.schoolId, req.auth.orgRole === "SCHOOL_ADMIN" ||
                req.auth.orgRole === "PROPRIETOR");
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    enqueue = async (req, res, next) => {
        try {
            const input = communication_validation_1.enqueueNotificationSchema.parse(req.body);
            const data = await communication_service_1.communicationService.enqueue(req.auth.schoolId, input);
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    listOutbox = async (req, res, next) => {
        try {
            const status = typeof req.query.status === "string" ? req.query.status : undefined;
            const data = await communication_service_1.communicationService.listOutbox(req.auth.schoolId, {
                status,
            });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    processOutbox = async (req, res, next) => {
        try {
            // Protect this route — only platform or school admin
            const data = await communication_service_1.communicationService.processOutbox(20, req.auth.schoolId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.CommunicationController = CommunicationController;
exports.communicationController = new CommunicationController();
