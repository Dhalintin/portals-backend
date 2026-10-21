"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicSessionsController = exports.AcademicSessionsController = void 0;
const academic_sessions_service_1 = require("./academic-sessions.service");
const response_1 = require("../../common/http/response");
function actorFromReq(req) {
    const user = req.user;
    const schoolId = req.schoolId ?? user.schoolId;
    if (!user?.sub || !schoolId) {
        throw new Error("Missing auth or school context");
    }
    return {
        userId: user.sub,
        globalRole: user.role,
        orgRole: user.orgRole,
        schoolId,
    };
}
class AcademicSessionsController {
    list = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.list(actor.schoolId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    current = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.getCurrent(actor.schoolId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getById = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.getById(actor.schoolId, req.params.id);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            console.log(actor);
            const data = await academic_sessions_service_1.academicSessionsService.create(actor.schoolId, req.body, actor);
            return (0, response_1.sendCreated)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.update(actor.schoolId, req.params.id, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    remove = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.remove(actor.schoolId, req.params.id, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateTerm = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            console.log(actor);
            const data = await academic_sessions_service_1.academicSessionsService.updateTerm(actor.schoolId, req.params.termId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getTerm = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await academic_sessions_service_1.academicSessionsService.getTerm(actor.schoolId, req.params.termId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.AcademicSessionsController = AcademicSessionsController;
exports.academicSessionsController = new AcademicSessionsController();
