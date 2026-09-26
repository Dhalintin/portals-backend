import { Request, Response, NextFunction } from "express";
import { platformAdminService } from "./platform-admin.service";
import { sendSuccess } from "../../common/http/response";
import {
  markPinsPrintedParamsSchema,
  markPinsPrintedSchema,
  type AssignSchoolsBody,
  type CreatePlatformAdminBody,
  type GeneratePinsForSchoolBody,
  type ListSchoolsQuery,
} from "./platform-admin.dto";
import { GlobalRole } from "@prisma/client";

function actorFromReq(req: Request) {
  const user = req.user as { sub: string; role?: string; globalRole?: string };
  const globalRole = (user.globalRole ?? user.role) as GlobalRole;
  if (!user?.sub) throw new Error("Unauthorized");
  return { userId: user.sub, globalRole };
}

export class PlatformAdminController {
  overview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.getMyOverview(actorFromReq(req));
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  listSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.listSchools(
        actorFromReq(req),
        req.query as unknown as ListSchoolsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.getSchoolDetail(
        actorFromReq(req),
        req.params.organizationId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  setSchoolActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.setSchoolActive(
        actorFromReq(req),
        req.params.organizationId as string,
        Boolean(req.body.isActive)
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  generatePins = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.generatePinsForSchool(
        actorFromReq(req),
        req.params.organizationId as string,
        req.body as GeneratePinsForSchoolBody
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  listPins = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.listPinsForSchool(
        actorFromReq(req),
        req.params.organizationId as string,
        req.query as any
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  markPrinted = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = markPinsPrintedParamsSchema.parse(req.params);
      const body = markPinsPrintedSchema.parse(req.body);

      const data = await platformAdminService.markPrinted(organizationId, body);
      return sendSuccess(res, data);
    } catch (err) {
      return next(err);
    }
  };

  pinStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId as string | undefined;
      const data = await platformAdminService.getPinStatsForSchool(
        actorFromReq(req),
        req.params.organizationId as string,
        termId
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  termPublishState = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await platformAdminService.getTermPublishState(
        actorFromReq(req),
        req.params.organizationId as string,
        req.params.termId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  // Super admin only
  createPlatformAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await platformAdminService.createPlatformAdmin(
        actorFromReq(req),
        req.body as CreatePlatformAdminBody
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      next(e);
    }
  };

  listPlatformAdmins = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await platformAdminService.listPlatformAdmins(
        actorFromReq(req),
        req.query as any
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  assignSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.assignSchools(
        actorFromReq(req),
        req.body as AssignSchoolsBody
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  unassignSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await platformAdminService.unassignSchool(
        actorFromReq(req),
        req.body.userId,
        req.body.organizationId
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  setPlatformAdminActive = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await platformAdminService.setPlatformAdminActive(
        actorFromReq(req),
        req.params.userId as string,
        Boolean(req.body.isActive)
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const platformAdminController = new PlatformAdminController();
