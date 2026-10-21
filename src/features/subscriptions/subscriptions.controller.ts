import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { subscriptionsService } from "./subscriptions.service";

export class SubscriptionsController {
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subscriptionsService.get(getSchoolId(req));
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}
