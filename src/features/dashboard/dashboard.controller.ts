import { AppError } from "../../lib/errors";
import type { Request, Response, NextFunction } from "express";
import { dashboardService } from "./dashboard.service";
import { exportQuerySchema, auditLogQuerySchema } from "./dashboard.validation";
import { sendSuccess } from "../../lib/http";

export class DashboardController {
  home = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await dashboardService.schoolHome(req.auth!.schoolId!, req.auth!.permissions);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  classSnapshot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await dashboardService.classSnapshot(
        req.auth!.schoolId!,
        req.params.classId as string,
        req.auth!.permissions
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  export = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = exportQuerySchema.parse(req.query);
      const readPermissions = {students:"students:read",attendance:"attendance:read",results:"results:read",invoices:"fees:read",payments:"payments:read"} as const;
      const readPermission = readPermissions[query.type];
      if (!req.auth!.permissions.includes(readPermission)) throw new AppError(403, "FORBIDDEN", "You do not have access to this report.");
      const rows = await dashboardService.exportData(
        req.auth!.schoolId!,
        query
      );

      if (query.format === "csv") {
        // Very simple CSV converter (for production consider a proper library)
        if (rows.length === 0) {
          res.setHeader("Content-Type", "text/csv");
          return res.send("");
        }
        const headers = Object.keys(rows[0]);
        const csv = [
          headers.join(","),
          ...rows.map((row) =>
            headers
              .map((h) => {
                const val = String((row as any)[h] ?? "");
                return `"${val.replace(/"/g, '""')}"`;
              })
              .join(",")
          ),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${query.type}-${Date.now()}.csv"`
        );
        return res.send(csv);
      }

      sendSuccess(res, rows);
    } catch (err) {
      next(err);
    }
  };

  reportCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await dashboardService.reportCardData(
        req.auth!.schoolId!,
        req.params.resultId as string,
        req.auth!
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  receipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await dashboardService.receiptData(
        req.auth!.schoolId!,
        req.params.receiptId as string
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  auditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = auditLogQuerySchema.parse(req.query);
      const data = await dashboardService.listAuditLogs(
        req.auth!.schoolId!,
        query
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const dashboardController = new DashboardController();
