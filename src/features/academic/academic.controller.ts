import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { academicService } from "./academic.service";

export class AcademicController {
  listSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.listSessions(getSchoolId(req));
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.createSession(
        getSchoolId(req),
        req.body
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  updateSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.updateSession(
        getSchoolId(req),
        req.params.sessionId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  setCurrentSession = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await academicService.setCurrentSession(
        getSchoolId(req),
        req.params.sessionId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  createTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.createTerm(
        getSchoolId(req),
        req.params.sessionId as string,
        req.body
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  updateTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.updateTerm(
        getSchoolId(req),
        req.params.sessionId as string,
        req.params.termId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  setCurrentTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.setCurrentTerm(
        getSchoolId(req),
        req.params.sessionId as string,
        req.params.termId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  getCurrent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await academicService.getCurrent(getSchoolId(req));
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}
