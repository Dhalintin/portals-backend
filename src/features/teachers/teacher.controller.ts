import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { teacherService } from "./teacher.service";
import type {
  InviteTeacherBody,
  ListTeachersQuery,
  SetAssignmentsBody,
  SetClassSubjectTeacherBody,
  SetClassTeacherBody,
  UpdateTeacherBody,
} from "./teacher.dto";

export const teacherController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await teacherService.list(
        req.user.schoolId ?? null,
        req.query as unknown as ListTeachersQuery
      );
      sendSuccess(res, { items: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.getById(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async invite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.invite(
        req.user.schoolId ?? null,
        req.body as InviteTeacherBody
      );
      sendCreated(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.update(
        req.user.schoolId ?? null,
        req.params.id as string,
        req.body as UpdateTeacherBody
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.remove(
        req.user.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async setAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.setAssignments(
        req.user.schoolId ?? null,
        req.params.id as string,
        req.body as SetAssignmentsBody
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async myAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const teacher = await teacherService.getMyAssignments(
        req.user.schoolId ?? null,
        req.user.sub
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async setClassTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await teacherService.setClassTeacher(
        req.user.schoolId ?? null,
        req.params.classId as string,
        req.body as SetClassTeacherBody
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async setClassSubjectTeacher(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await teacherService.setClassSubjectTeacher(
        req.user.schoolId ?? null,
        req.params.classId as string,
        req.body as SetClassSubjectTeacherBody
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async listClassSubjectTeachers(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await teacherService.listClassSubjectTeachers(
        req.user.schoolId ?? null,
        req.params.classId as string
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
};
