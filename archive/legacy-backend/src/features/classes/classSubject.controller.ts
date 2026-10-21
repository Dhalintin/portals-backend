// src/features/classes/classSubject.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { classSubjectService } from "./classSubject.service";
import type { SetClassSubjectsBody } from "./classSubject.dto";

export const classSubjectController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await classSubjectService.listForClass(
        req.user.schoolId ?? null,
        req.params.classId as string
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async set(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await classSubjectService.setForClass(
        req.user.schoolId ?? null,
        req.params.classId as string,
        req.body as SetClassSubjectsBody
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async add(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await classSubjectService.addSubject(
        req.user.schoolId ?? null,
        req.params.classId as string,
        (req.body as { subjectId: string }).subjectId
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await classSubjectService.removeSubject(
        req.user.schoolId ?? null,
        req.params.classId as string,
        req.params.subjectId as string
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
};
