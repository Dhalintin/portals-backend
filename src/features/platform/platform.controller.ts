import type { Request, Response, NextFunction } from "express";
import { platformService } from "./platform.service";
import {
  listSchoolsQuerySchema,
  updateSchoolStatusSchema,
  updateSubscriptionSchema,
  assignPlatformAdminSchema,
  createPlatformUserSchema,
} from "./platform.validation";
import { sendSuccess } from "../../lib/http";

export class PlatformController {
  listSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listSchoolsQuerySchema.parse(req.query);
      const data = await platformService.listSchools(query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformService.getSchool(req.params.id as string);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  setSchoolStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateSchoolStatusSchema.parse(req.body);
      const data = await platformService.setSchoolActive(
        req.params.id as string,
        input.isActive,
        req.auth!.userId,
        input.reason,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  updateSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = updateSubscriptionSchema.parse(req.body);
      const data = await platformService.updateSubscription(
        req.params.id as string,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  assignAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = assignPlatformAdminSchema.parse(req.body);
      const data = await platformService.assignPlatformAdmin(
        input,
        req.auth!.userId
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  removeAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, organizationId } = req.params;
      const data = await platformService.removePlatformAdmin(
        userId as string,
        organizationId as string
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listAdmins = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId =
        typeof req.query.organizationId === "string"
          ? req.query.organizationId
          : undefined;
      const data = await platformService.listPlatformAdmins(organizationId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  createPlatformUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = createPlatformUserSchema.parse(req.body);
      const data = await platformService.createPlatformUser(input);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  metrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformService.platformMetrics();
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const platformController = new PlatformController();
