"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceController = exports.AttendanceController = void 0;
const attendance_service_1 = require("./attendance.service");
const attendance_validation_1 = require("./attendance.validation");
const http_1 = require("../../lib/http");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
class AttendanceController {
    parentHistory = async (req, res, next) => {
        try {
            const query = attendance_validation_1.listByStudentSchema.parse({ ...req.query, studentId: req.params.studentId });
            await (0, resourceAccess_1.assertParentChildAccess)(req.auth, query.studentId);
            (0, http_1.sendSuccess)(res, await attendance_service_1.attendanceService.listByStudent(req.auth.schoolId, query.studentId, query));
        }
        catch (error) {
            next(error);
        }
    };
    markClass = async (req, res, next) => {
        try {
            const input = attendance_validation_1.markClassAttendanceSchema.parse(req.body);
            const data = await attendance_service_1.attendanceService.markClassAttendance(req.auth.schoolId, req.auth.userId, input, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    updateOne = async (req, res, next) => {
        try {
            const input = attendance_validation_1.updateAttendanceSchema.parse(req.body);
            const data = await attendance_service_1.attendanceService.updateOne(req.auth.schoolId, req.params.id, req.auth.userId, input, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    listByClassDate = async (req, res, next) => {
        try {
            const q = attendance_validation_1.listByClassDateSchema.parse(req.query);
            const data = await attendance_service_1.attendanceService.listByClassAndDate(req.auth.schoolId, q.classId, q.date, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    listByStudent = async (req, res, next) => {
        try {
            const q = attendance_validation_1.listByStudentSchema.parse({
                ...req.query,
                studentId: req.params.studentId,
            });
            const data = await attendance_service_1.attendanceService.listByStudent(req.auth.schoolId, q.studentId, { from: q.from, to: q.to, limit: q.limit }, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    offlineSync = async (req, res, next) => {
        try {
            const input = attendance_validation_1.offlineSyncSchema.parse(req.body);
            const data = await attendance_service_1.attendanceService.offlineSync(req.auth.schoolId, req.auth.userId, input, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    absentToday = async (req, res, next) => {
        try {
            const date = typeof req.query.date === "string" ? req.query.date : undefined;
            const data = await attendance_service_1.attendanceService.absentToday(req.auth.schoolId, date, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    percentage = async (req, res, next) => {
        try {
            const from = req.query.from;
            const to = req.query.to;
            if (!from || !to) {
                throw new errors_1.AppError(400, "VALIDATION_ERROR", "from and to are required");
            }
            const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
            const data = await attendance_service_1.attendanceService.attendancePercentage(req.auth.schoolId, { from, to, classId }, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.AttendanceController = AttendanceController;
exports.attendanceController = new AttendanceController();
