// imports.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { importsService } from "./imports.service";

export class ImportsController {
  students = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await importsService.importStudents(
        getSchoolId(req),
        req.body,
        req.auth!.userId,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  parents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await importsService.importParents(
        getSchoolId(req),
        req.body,
        req.auth!.userId,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}
