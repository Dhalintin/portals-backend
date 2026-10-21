import type { Request, Response, NextFunction } from "express";
import { communicationService } from "./communication.service";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  listAnnouncementsQuerySchema,
  enqueueNotificationSchema,
} from "./communication.validation";
import { sendSuccess } from "../../lib/http";
// import { sendSuccess } from "../lib/http";

export class CommunicationController {
  createAnnouncement = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = createAnnouncementSchema.parse(req.body);
      const data = await communicationService.createAnnouncement(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  publishAnnouncement = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await communicationService.publishAnnouncement(
        req.params.id! as string,
        req.auth!.schoolId!,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  listAnnouncements = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const query = listAnnouncementsQuerySchema.parse(req.query);

      const data = await communicationService.listAnnouncements(
        req.auth!.schoolId!,
        {
          isAdmin: req.auth!.permissions.includes("announcements:write"),
          activeOnly: query.activeOnly,
          limit: query.limit,
        }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await communicationService.getAnnouncement(
        req.params.id as string,
        req.auth!.schoolId!,
        req.auth!.orgRole === "SCHOOL_ADMIN" ||
          req.auth!.orgRole === "PROPRIETOR" ||
          req.auth!.orgRole === "PRINCIPAL"
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  updateAnnouncement = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = updateAnnouncementSchema.parse(req.body);
      const data = await communicationService.updateAnnouncement(
        req.params.id as string,
        req.auth!.schoolId!,
        {
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          isActive: input.isActive,
          publishAt: input.publishAt,
          expiresAt: input.expiresAt,
        },
        req.auth!.userId,
        { requestId: req.requestId }
      );

      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  deleteAnnouncement = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await communicationService.deleteAnnouncement(
        req.params.id as string,
        req.auth!.schoolId!,
        req.auth!.orgRole === "SCHOOL_ADMIN" ||
          req.auth!.orgRole === "PROPRIETOR"
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  enqueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = enqueueNotificationSchema.parse(req.body);
      const data = await communicationService.enqueue(
        req.auth!.schoolId!,
        input
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  listOutbox = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await communicationService.listOutbox(req.auth!.schoolId!, {
        status,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  processOutbox = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Protect this route — only platform or school admin
      const data = await communicationService.processOutbox(20, req.auth!.schoolId!);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const communicationController = new CommunicationController();
