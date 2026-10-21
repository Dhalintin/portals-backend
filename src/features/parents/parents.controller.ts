import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { parentsService } from "./parents.service";
import { AppError } from "../../lib/errors";

export class ParentsController {
  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.auth!.orgRole !== "PARENT") throw new AppError(403, "FORBIDDEN", "Parent membership required");
      return sendSuccess(res, await parentsService.me(getSchoolId(req), req.auth!.userId));
    } catch (error) { return next(error); }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.list(
        getSchoolId(req),
        req.query as never
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.get(
        getSchoolId(req),
        req.params.parentId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.create(getSchoolId(req), req.body);
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.update(
        getSchoolId(req),
        req.params.parentId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  linkStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.linkStudent(
        getSchoolId(req),
        req.params.parentId as string,
        req.body
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  unlinkStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.unlinkStudent(
        getSchoolId(req),
        req.params.parentId as string,
        req.params.studentId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  inviteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await parentsService.inviteUser(
        getSchoolId(req),
        req.params.parentId as string,
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
