// src/features/classes/class.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { classService } from "./class.service";
import type {
  CreateClassBody,
  ListClassesQuery,
  UpdateClassBody,
} from "./class.dto";

export const classController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await classService.list(
        req.user.schoolId ?? null,
        req.query as unknown as ListClassesQuery
      );
      sendSuccess(res, { items: result.items }, 200, result.meta);
      // If sendSuccess has no meta arg:
      // sendSuccess(res, { items: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const item = await classService.getById(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { class: item });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const item = await classService.create(
        req.user.schoolId ?? null,
        req.body as CreateClassBody
      );
      sendCreated(res, { class: item });
      // or: sendSuccess(res, { class: item }, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const item = await classService.update(
        req.user.schoolId ?? null,
        req.params.id as string,
        req.body as UpdateClassBody
      );
      sendSuccess(res, { class: item });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const item = await classService.remove(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { class: item });
    } catch (err) {
      next(err);
    }
  },
};
