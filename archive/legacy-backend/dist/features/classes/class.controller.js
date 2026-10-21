"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const class_service_1 = require("./class.service");
exports.classController = {
    async list(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await class_service_1.classService.list(req.user.schoolId ?? null, req.query);
            (0, response_1.sendSuccess)(res, { items: result.items }, 200, result.meta);
            // If sendSuccess has no meta arg:
            // sendSuccess(res, { items: result.items, meta: result.meta });
        }
        catch (err) {
            next(err);
        }
    },
    async getById(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const item = await class_service_1.classService.getById(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { class: item });
        }
        catch (err) {
            next(err);
        }
    },
    async create(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const item = await class_service_1.classService.create(req.user.schoolId ?? null, req.body);
            (0, response_1.sendCreated)(res, { class: item });
            // or: sendSuccess(res, { class: item }, 201);
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const item = await class_service_1.classService.update(req.user.schoolId ?? null, req.params.id, req.body);
            (0, response_1.sendSuccess)(res, { class: item });
        }
        catch (err) {
            next(err);
        }
    },
    async remove(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const item = await class_service_1.classService.remove(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { class: item });
        }
        catch (err) {
            next(err);
        }
    },
};
