// src/features/students/student.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { studentService } from "./student.service";
import type {
  BulkCreateStudentsBody,
  CreateStudentBody,
  ListStudentsQuery,
  UpdateStudentBody,
} from "./student.dto";

export const studentController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await studentService.list(
        req.user.schoolId ?? null,
        req.query as unknown as ListStudentsQuery
      );
      sendSuccess(res, {
        items: result.items,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const student = await studentService.getById(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { student });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const student = await studentService.create(
        req.user.schoolId ?? null,
        req.body as CreateStudentBody
      );
      sendSuccess(res, { student }, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    console.log("Updating record!");
    try {
      if (!req.user) throw new UnauthorizedError();
      const student = await studentService.update(
        req.user.schoolId ?? null,
        req.params.id as string,
        req.body as UpdateStudentBody
      );
      sendSuccess(res, { student });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const student = await studentService.remove(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { student });
    } catch (err) {
      next(err);
    }
  },

  async bulkCreate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await studentService.bulkCreate(
        req.user.schoolId ?? null,
        req.body as BulkCreateStudentsBody
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
};
