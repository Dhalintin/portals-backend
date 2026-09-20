import { Request, Response, NextFunction } from "express";
import { academicSessionsService } from "./academic-sessions.service";
import type {
  CreateSessionBody,
  ListSessionsQuery,
  UpdateSessionBody,
  UpdateTermBody,
} from "./academic-sessions.dto";
import { sendSuccess, sendCreated } from "../../common/http/response";

function actorFromReq(req: Request) {
  const user = req.user as {
    sub: string;
    role?: string;
    orgRole?: string;
    schoolId?: string;
  };
  const schoolId = (req as any).schoolId ?? user.schoolId;

  if (!user?.sub || !schoolId) {
    throw new Error("Missing auth or school context");
  }

  return {
    userId: user.sub,
    globalRole: user.role,
    orgRole: user.orgRole as any,
    schoolId,
  };
}

export class AcademicSessionsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.list(
        actor.schoolId,
        req.query as unknown as ListSessionsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  current = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.getCurrent(actor.schoolId);
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.getById(
        actor.schoolId,
        req.params.id as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      console.log(actor);
      const data = await academicSessionsService.create(
        actor.schoolId,
        req.body as CreateSessionBody,
        actor
      );
      return sendCreated(res, data);
    } catch (e) {
      next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.update(
        actor.schoolId,
        req.params.id as string,
        req.body as UpdateSessionBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.remove(
        actor.schoolId,
        req.params.id as string,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      console.log(actor);
      const data = await academicSessionsService.updateTerm(
        actor.schoolId,
        req.params.termId as string,
        req.body as UpdateTermBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await academicSessionsService.getTerm(
        actor.schoolId,
        req.params.termId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const academicSessionsController = new AcademicSessionsController();
