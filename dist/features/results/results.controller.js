"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultsController = exports.ResultsController = void 0;
const results_service_1 = require("./results.service");
const response_1 = require("../../common/http/response");
function actorFromReq(req) {
    const user = req.user;
    const schoolId = req.schoolId ??
        user.schoolId ??
        req.headers["x-school-id"];
    if (!user?.sub || !schoolId) {
        throw new Error("Missing auth or school context"); // your AppError.Unauthorized ideally
    }
    return {
        userId: user.sub,
        globalRole: user.role,
        orgRole: user.orgRole,
        schoolId,
    };
}
class ResultsController {
    list = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.list(actor.schoolId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getById = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.getById(actor.schoolId, req.params.id);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getByStudentTerm = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.getByStudentAndTerm(actor.schoolId, req.params.studentId, req.params.termId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    entrySheet = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const { classId, termId, subjectId } = req.query;
            const data = await results_service_1.resultsService.getClassSubjectEntrySheet(actor.schoolId, classId, termId, subjectId, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateMeta = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.updateResultMeta(actor.schoolId, req.params.id, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    upsertStudentScores = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.upsertScoresForStudent(actor.schoolId, req.params.studentId, req.params.termId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    bulkSubjectScores = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.bulkUpsertSubjectScores(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    publish = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.publish(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    recalculatePositions = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.recalculatePositions(actor.schoolId, req.body);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    stats = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await results_service_1.resultsService.stats(actor.schoolId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    verifyPublic = async (req, res, next) => {
        try {
            const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
                req.socket.remoteAddress;
            const data = await results_service_1.resultsService.verifyPublic(req.body, ip);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.ResultsController = ResultsController;
exports.resultsController = new ResultsController();
