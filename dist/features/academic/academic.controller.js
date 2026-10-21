"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcademicController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const academic_service_1 = require("./academic.service");
class AcademicController {
    listSessions = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.listSessions((0, requireSchool_1.getSchoolId)(req));
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    createSession = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.createSession((0, requireSchool_1.getSchoolId)(req), req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    updateSession = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.updateSession((0, requireSchool_1.getSchoolId)(req), req.params.sessionId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    setCurrentSession = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.setCurrentSession((0, requireSchool_1.getSchoolId)(req), req.params.sessionId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    createTerm = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.createTerm((0, requireSchool_1.getSchoolId)(req), req.params.sessionId, req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    updateTerm = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.updateTerm((0, requireSchool_1.getSchoolId)(req), req.params.sessionId, req.params.termId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    setCurrentTerm = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.setCurrentTerm((0, requireSchool_1.getSchoolId)(req), req.params.sessionId, req.params.termId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    getCurrent = async (req, res, next) => {
        try {
            const data = await academic_service_1.academicService.getCurrent((0, requireSchool_1.getSchoolId)(req));
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.AcademicController = AcademicController;
