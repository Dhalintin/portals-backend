"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const subject_service_1 = require("./subject.service");
exports.subjectController = {
    async list(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await subject_service_1.subjectService.list(req.user.schoolId ?? null, req.query);
            (0, response_1.sendSuccess)(res, { items: result.items, meta: result.meta });
        }
        catch (err) {
            next(err);
        }
    },
    async getById(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const subject = await subject_service_1.subjectService.getById(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { subject });
        }
        catch (err) {
            next(err);
        }
    },
    async create(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const subject = await subject_service_1.subjectService.create(req.user.schoolId ?? null, req.body);
            (0, response_1.sendCreated)(res, { subject });
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const subject = await subject_service_1.subjectService.update(req.user.schoolId ?? null, req.params.id, req.body);
            (0, response_1.sendSuccess)(res, { subject });
        }
        catch (err) {
            next(err);
        }
    },
    async remove(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const subject = await subject_service_1.subjectService.remove(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { subject });
        }
        catch (err) {
            next(err);
        }
    },
};
