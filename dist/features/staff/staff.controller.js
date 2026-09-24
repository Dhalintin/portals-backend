"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffController = exports.StaffController = void 0;
const staff_service_1 = require("./staff.service");
const response_1 = require("../../common/http/response");
const client_1 = require("@prisma/client");
function staffActor(req) {
    const user = req.user;
    const organizationId = req.schoolId ?? user.schoolId;
    if (!user?.sub || !organizationId) {
        throw new Error("Missing staff school context");
    }
    return {
        userId: user.sub,
        organizationId,
        orgRole: (user.orgRole ?? client_1.OrgRole.TEACHER),
    };
}
class StaffController {
    dashboard = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.getMyDashboard(staffActor(req));
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    assignments = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.listMyAssignments(staffActor(req));
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    classDetail = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.getClassDetail(staffActor(req), req.params.classId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    classRoster = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.getClassRoster(staffActor(req), req.params.classId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    entrySheet = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.getEntrySheet(staffActor(req), {
                termId: String(req.query.termId),
                classId: String(req.query.classId),
                subjectId: String(req.query.subjectId),
            });
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    bulkScores = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.bulkUpsertScores(staffActor(req), req.body);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    progress = async (req, res, next) => {
        try {
            const data = await staff_service_1.staffService.getAssignmentProgress(staffActor(req), {
                termId: String(req.query.termId),
                classId: String(req.query.classId),
                subjectId: String(req.query.subjectId),
            });
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.StaffController = StaffController;
exports.staffController = new StaffController();
