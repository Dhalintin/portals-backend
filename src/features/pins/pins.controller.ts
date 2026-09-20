import { Request, Response, NextFunction } from "express";
import { pinsService } from "./pins.service";
import { sendSuccess, sendCreated } from "../../common/http/response"; // adjust
import type {
  GeneratePinsBody,
  ListPinsQuery,
  PinsStatsQuery,
  UpdatePinBody,
  VerifyPinBody,
} from "./pins.dto";

function actorFromReq(req: Request) {
  const user = req.user as {
    sub: string;
    role?: string;
    orgRole?: string;
    schoolId?: string;
  };
  const schoolId = (req as any).schoolId ?? user.schoolId;
  if (!user?.sub || !schoolId) {
    throw new Error("Missing auth or school context");
  }
  return {
    userId: user.sub,
    globalRole: user.role,
    orgRole: user.orgRole as any,
    schoolId,
  };
}

export class PinsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.list(
        actor.schoolId,
        req.query as unknown as ListPinsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  stats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.stats(
        actor.schoolId,
        req.query as unknown as PinsStatsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.getById(
        actor.schoolId,
        req.params.id as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  generate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.generate(
        actor.schoolId,
        req.body as GeneratePinsBody,
        actor
      );
      return sendCreated(res, data);
    } catch (e) {
      next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.update(
        actor.schoolId,
        req.params.id as string,
        req.body as UpdatePinBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  disable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await pinsService.disable(
        actor.schoolId,
        req.params.id as string,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  verifyPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress;
      const data = await pinsService.verifyPublic(
        req.body as VerifyPinBody,
        ip
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const pinsController = new PinsController();
