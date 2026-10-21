"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const student_service_1 = require("./student.service");
exports.studentController = {
    async list(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await student_service_1.studentService.list(req.user.schoolId ?? null, req.query);
            (0, response_1.sendSuccess)(res, {
                items: result.items,
                meta: result.meta,
            });
        }
        catch (err) {
            next(err);
        }
    },
    async getById(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const student = await student_service_1.studentService.getById(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { student });
        }
        catch (err) {
            next(err);
        }
    },
    async create(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const student = await student_service_1.studentService.create(req.user.schoolId ?? null, req.body);
            (0, response_1.sendSuccess)(res, { student }, 201);
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        console.log("Updating record!");
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const student = await student_service_1.studentService.update(req.user.schoolId ?? null, req.params.id, req.body);
            (0, response_1.sendSuccess)(res, { student });
        }
        catch (err) {
            next(err);
        }
    },
    async remove(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const student = await student_service_1.studentService.remove(req.user.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { student });
        }
        catch (err) {
            next(err);
        }
    },
    async bulkCreate(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await student_service_1.studentService.bulkCreate(req.user.schoolId ?? null, req.body);
            (0, response_1.sendSuccess)(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    },
};
