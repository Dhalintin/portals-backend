import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { invitationsService } from "../auth/invitations.service";
import { teacherService } from "./teacher.service";
import type {
  ListTeachersQuery,
  SetAssignmentsBody,
  SetClassSubjectTeacherBody,
  SetClassTeacherBody,
  UpdateTeacherBody,
} from "./teacher.dto";

export const teacherController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await teacherService.list(
        req.auth.schoolId ?? null,
        req.query as unknown as ListTeachersQuery
      );
      sendSuccess(res, { items: result.items, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const teacher = await teacherService.getById(
        req.auth.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async invite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      console.log("Here 1");
      const invitation = await invitationsService.create(
        req.auth.schoolId!,
        req.auth.userId,
        { ...req.body, phone: req.body.phone ?? undefined },
        req.requestId
      );
      sendCreated(res, { invitation });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const teacher = await teacherService.update(
        req.auth.schoolId ?? null,
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
      if (!req.auth) throw new UnauthorizedError();
      const teacher = await teacherService.remove(
        req.auth.schoolId ?? null,
        req.params.id as string
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async setAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const teacher = await teacherService.setAssignments(
        req.auth.schoolId ?? null,
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
      if (!req.auth) throw new UnauthorizedError();
      const teacher = await teacherService.getMyAssignments(
        req.auth.schoolId ?? null,
        req.auth.userId
      );
      sendSuccess(res, { teacher });
    } catch (err) {
      next(err);
    }
  },

  async setClassTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.auth) throw new UnauthorizedError();
      const result = await teacherService.setClassTeacher(
        req.auth.schoolId ?? null,
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
      if (!req.auth) throw new UnauthorizedError();
      const result = await teacherService.setClassSubjectTeacher(
        req.auth.schoolId ?? null,
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
      if (!req.auth) throw new UnauthorizedError();
      const result = await teacherService.listClassSubjectTeachers(
        req.auth.schoolId ?? null,
        req.params.classId as string
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
};
