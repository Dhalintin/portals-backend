import type { Request, Response, NextFunction } from "express";
import { attendanceService } from "./attendance.service";
import {
  markClassAttendanceSchema,
  updateAttendanceSchema,
  listByClassDateSchema,
  listByStudentSchema,
  offlineSyncSchema,
} from "./attendance.validation";
import { sendSuccess } from "../../lib/http";
import { AppError } from "../../lib/errors";
import { assertParentChildAccess } from "../../auth/resourceAccess";

export class AttendanceController {
  parentHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listByStudentSchema.parse({ ...req.query, studentId: req.params.studentId });
      await assertParentChildAccess(req.auth!, query.studentId);
      sendSuccess(res, await attendanceService.listByStudent(req.auth!.schoolId!, query.studentId, query));
    } catch (error) { next(error); }
  };
  markClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = markClassAttendanceSchema.parse(req.body);
      const data = await attendanceService.markClassAttendance(
        req.auth!.schoolId!,
        req.auth!.userId,
        input,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  updateOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateAttendanceSchema.parse(req.body);
      const data = await attendanceService.updateOne(
        req.auth!.schoolId!,
        req.params.id as string,
        req.auth!.userId,
        input,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listByClassDate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = listByClassDateSchema.parse(req.query);
      const data = await attendanceService.listByClassAndDate(
        req.auth!.schoolId!,
        q.classId,
        q.date,
        req.auth!
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listByStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = listByStudentSchema.parse({
        ...req.query,
        studentId: req.params.studentId,
      });
      const data = await attendanceService.listByStudent(
        req.auth!.schoolId!,
        q.studentId,
        { from: q.from, to: q.to, limit: q.limit },
        req.auth!
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  offlineSync = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = offlineSyncSchema.parse(req.body);
      const data = await attendanceService.offlineSync(
        req.auth!.schoolId!,
        req.auth!.userId,
        input,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  absentToday = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const date =
        typeof req.query.date === "string" ? req.query.date : undefined;
      const data = await attendanceService.absentToday(
        req.auth!.schoolId!,
        date,
        req.auth!
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  percentage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) {
        throw new AppError(400, "VALIDATION_ERROR", "from and to are required");
      }
      const classId =
        typeof req.query.classId === "string" ? req.query.classId : undefined;
      const data = await attendanceService.attendancePercentage(
        req.auth!.schoolId!,
        { from, to, classId },
        req.auth!
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const attendanceController = new AttendanceController();
