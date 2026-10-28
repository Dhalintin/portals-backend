"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = exports.DashboardController = void 0;
const errors_1 = require("../../lib/errors");
const dashboard_service_1 = require("./dashboard.service");
const dashboard_validation_1 = require("./dashboard.validation");
const http_1 = require("../../lib/http");
class DashboardController {
    home = async (req, res, next) => {
        try {
            const data = await dashboard_service_1.dashboardService.schoolHome(req.auth.schoolId, req.auth.permissions);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    classSnapshot = async (req, res, next) => {
        try {
            const data = await dashboard_service_1.dashboardService.classSnapshot(req.auth.schoolId, req.params.classId, req.auth.permissions);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    export = async (req, res, next) => {
        try {
            const query = dashboard_validation_1.exportQuerySchema.parse(req.query);
            const readPermissions = { students: "students:read", attendance: "attendance:read", results: "results:read", invoices: "fees:read", payments: "payments:read" };
            const readPermission = readPermissions[query.type];
            if (!req.auth.permissions.includes(readPermission))
                throw new errors_1.AppError(403, "FORBIDDEN", "You do not have access to this report.");
            const rows = await dashboard_service_1.dashboardService.exportData(req.auth.schoolId, query);
            if (query.format === "csv") {
                // Very simple CSV converter (for production consider a proper library)
                if (rows.length === 0) {
                    res.setHeader("Content-Type", "text/csv");
                    return res.send("");
                }
                const headers = Object.keys(rows[0]);
                const csv = [
                    headers.join(","),
                    ...rows.map((row) => headers
                        .map((h) => {
                        const val = String(row[h] ?? "");
                        return `"${val.replace(/"/g, '""')}"`;
                    })
                        .join(",")),
                ].join("\n");
                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename="${query.type}-${Date.now()}.csv"`);
                return res.send(csv);
            }
            (0, http_1.sendSuccess)(res, rows);
        }
        catch (err) {
            next(err);
        }
    };
    reportCard = async (req, res, next) => {
        try {
            const data = await dashboard_service_1.dashboardService.reportCardData(req.auth.schoolId, req.params.resultId, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    receipt = async (req, res, next) => {
        try {
            const data = await dashboard_service_1.dashboardService.receiptData(req.auth.schoolId, req.params.receiptId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    auditLogs = async (req, res, next) => {
        try {
            const query = dashboard_validation_1.auditLogQuerySchema.parse(req.query);
            const data = await dashboard_service_1.dashboardService.listAuditLogs(req.auth.schoolId, query);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.DashboardController = DashboardController;
exports.dashboardController = new DashboardController();
