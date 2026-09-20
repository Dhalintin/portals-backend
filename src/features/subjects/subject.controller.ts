import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { subjectService } from "./subject.service";
import type {
  CreateSubjectBody,
  ListSubjectsQuery,
  UpdateSubjectBody,
} from "./subject.dto";

export const subjectController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await subjectService.list(
        req.user.schoolId ?? null,
        req.query as unknown as ListSubjectsQuery
      );
      sendSuccess(res, { items: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const subject = await subjectService.getById(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { subject });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const subject = await subjectService.create(
        req.user.schoolId ?? null,
        req.body as CreateSubjectBody
      );
      sendCreated(res, { subject });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const subject = await subjectService.update(
        req.user.schoolId ?? null,
        req.params.id as string,
        req.body as UpdateSubjectBody
      );
      sendSuccess(res, { subject });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const subject = await subjectService.remove(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { subject });
    } catch (err) {
      next(err);
    }
  },
};
