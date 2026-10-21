import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { staffService } from "./staff.service";
import { membershipsService } from "../memberships/memberships.service";
export class StaffController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try { return sendSuccess(res, await staffService.list(getSchoolId(req))); }
    catch (error) { next(error); }
  };
  invite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await membershipsService.create(getSchoolId(req),
        { userId: req.auth!.userId, orgRole: req.auth!.orgRole }, req.body, req.requestId);
      return sendSuccess(res, invitation, 201);
    } catch (error) { next(error); }
  };
}
