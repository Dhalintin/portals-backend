import { Request, Response, NextFunction } from "express";
import { staffService } from "./staff.service";
import { sendSuccess } from "../../common/http/response";
import type { BulkScoresBody } from "./staff.dto";
import { OrgRole } from "@prisma/client";

function staffActor(req: Request) {
  const user = req.user as {
    sub: string;
    orgRole?: string;
    schoolId?: string;
  };
  const organizationId = (req as any).schoolId ?? user.schoolId;
  if (!user?.sub || !organizationId) {
    throw new Error("Missing staff school context");
  }
  return {
    userId: user.sub,
    organizationId,
    orgRole: (user.orgRole ?? OrgRole.TEACHER) as OrgRole,
  };
}

export class StaffController {
  dashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.getMyDashboard(staffActor(req));
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  assignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.listMyAssignments(staffActor(req));
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  classDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.getClassDetail(
        staffActor(req),
        req.params.classId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  classRoster = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.getClassRoster(
        staffActor(req),
        req.params.classId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  entrySheet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.getEntrySheet(staffActor(req), {
        termId: String(req.query.termId),
        classId: String(req.query.classId),
        subjectId: String(req.query.subjectId),
      });
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  bulkScores = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.bulkUpsertScores(
        staffActor(req),
        req.body as BulkScoresBody
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  progress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await staffService.getAssignmentProgress(staffActor(req), {
        termId: String(req.query.termId),
        classId: String(req.query.classId),
        subjectId: String(req.query.subjectId),
      });
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const staffController = new StaffController();
