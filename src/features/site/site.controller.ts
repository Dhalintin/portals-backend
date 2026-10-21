import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { siteService } from "./site.service";
import { getSchoolId } from "../../middlewares/requireSchool";

export class SiteController {
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await siteService.get(getSchoolId(req));
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await siteService.update(
        getSchoolId(req),
        req.auth!.userId,
        req.body,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}
