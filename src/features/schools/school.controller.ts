// src/features/schools/school.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { schoolService } from "./school.service";
import type { UpdateSchoolBody } from "./school.dto";

export const schoolController = {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const school = await schoolService.getMe(req.user.schoolId ?? null);
      sendSuccess(res, { school });
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const school = await schoolService.updateMe(
        req.user.schoolId ?? null,
        req.user.sub,
        req.body as UpdateSchoolBody
      );
      sendSuccess(res, { school });
    } catch (err) {
      next(err);
    }
  },
};
