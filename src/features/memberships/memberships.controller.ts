import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { membershipsService } from "./memberships.service";

export class MembershipsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await membershipsService.list(
        getSchoolId(req),
        req.query as never
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await membershipsService.create(
        getSchoolId(req),
        { userId: req.auth!.userId, orgRole: req.auth!.orgRole },
        req.body,
        req.requestId
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await membershipsService.update(
        getSchoolId(req),
        req.params.membershipId as string,
        { userId: req.auth!.userId, orgRole: req.auth!.orgRole },
        req.body,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}
