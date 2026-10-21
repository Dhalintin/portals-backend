"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const parents_service_1 = require("./parents.service");
const errors_1 = require("../../lib/errors");
class ParentsController {
    me = async (req, res, next) => {
        try {
            if (req.auth.orgRole !== "PARENT")
                throw new errors_1.AppError(403, "FORBIDDEN", "Parent membership required");
            return (0, http_1.sendSuccess)(res, await parents_service_1.parentsService.me((0, requireSchool_1.getSchoolId)(req), req.auth.userId));
        }
        catch (error) {
            return next(error);
        }
    };
    list = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.list((0, requireSchool_1.getSchoolId)(req), req.query);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    get = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.get((0, requireSchool_1.getSchoolId)(req), req.params.parentId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.create((0, requireSchool_1.getSchoolId)(req), req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.update((0, requireSchool_1.getSchoolId)(req), req.params.parentId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    linkStudent = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.linkStudent((0, requireSchool_1.getSchoolId)(req), req.params.parentId, req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    unlinkStudent = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.unlinkStudent((0, requireSchool_1.getSchoolId)(req), req.params.parentId, req.params.studentId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    inviteUser = async (req, res, next) => {
        try {
            const data = await parents_service_1.parentsService.inviteUser((0, requireSchool_1.getSchoolId)(req), req.params.parentId, req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.ParentsController = ParentsController;
