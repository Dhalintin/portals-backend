import { Request, Response, NextFunction } from "express";
import { resultsService } from "./results.service";
import { sendSuccess } from "../../common/http/response";
import type {
  BulkScoresBody,
  ListResultsQuery,
  PublishResultsBody,
  RecalculatePositionsBody,
  ResultsStatsQuery,
  UpdateResultBody,
  UpsertScoresBody,
  VerifyResultBody,
} from "./results.dto";

function actorFromReq(req: Request) {
  const user = req.user as {
    sub: string;
    role?: string;
    orgRole?: string;
    schoolId?: string;
  };
  const schoolId =
    (req as any).schoolId ??
    user.schoolId ??
    (req.headers["x-school-id"] as string | undefined);

  if (!user?.sub || !schoolId) {
    throw new Error("Missing auth or school context"); // your AppError.Unauthorized ideally
  }

  return {
    userId: user.sub,
    globalRole: user.role,
    orgRole: user.orgRole as any,
    schoolId,
  };
}

export class ResultsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.list(
        actor.schoolId,
        req.query as unknown as ListResultsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.getById(
        actor.schoolId,
        req.params.id as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getByStudentTerm = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.getByStudentAndTerm(
        actor.schoolId,
        req.params.studentId as string,
        req.params.termId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  entrySheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const { classId, termId, subjectId } = req.query as {
        classId: string;
        termId: string;
        subjectId: string;
      };
      const data = await resultsService.getClassSubjectEntrySheet(
        actor.schoolId,
        classId,
        termId,
        subjectId,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateMeta = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.updateResultMeta(
        actor.schoolId,
        req.params.id as string,
        req.body as UpdateResultBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  upsertStudentScores = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.upsertScoresForStudent(
        actor.schoolId,
        req.params.studentId as string,
        req.params.termId as string,
        req.body as UpsertScoresBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  bulkSubjectScores = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.bulkUpsertSubjectScores(
        actor.schoolId,
        req.body as BulkScoresBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  publish = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.publish(
        actor.schoolId,
        req.body as PublishResultsBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  recalculatePositions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.recalculatePositions(
        actor.schoolId,
        req.body as RecalculatePositionsBody
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  stats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await resultsService.stats(
        actor.schoolId,
        req.query as unknown as ResultsStatsQuery
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  verifyPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress;
      const data = await resultsService.verifyPublic(
        req.body as VerifyResultBody,
        ip
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const resultsController = new ResultsController();
