"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classSubjectController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const classSubject_service_1 = require("./classSubject.service");
exports.classSubjectController = {
    async list(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await classSubject_service_1.classSubjectService.listForClass(req.user.schoolId ?? null, req.params.classId);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async set(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await classSubject_service_1.classSubjectService.setForClass(req.user.schoolId ?? null, req.params.classId, req.body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async add(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await classSubject_service_1.classSubjectService.addSubject(req.user.schoolId ?? null, req.params.classId, req.body.subjectId);
            (0, response_1.sendSuccess)(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    },
    async remove(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await classSubject_service_1.classSubjectService.removeSubject(req.user.schoolId ?? null, req.params.classId, req.params.subjectId);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
};
