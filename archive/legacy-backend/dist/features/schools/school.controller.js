"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const school_service_1 = require("./school.service");
exports.schoolController = {
    async getMe(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const school = await school_service_1.schoolService.getMe(req.user.schoolId ?? null);
            (0, response_1.sendSuccess)(res, { school });
        }
        catch (err) {
            next(err);
        }
    },
    async updateMe(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const school = await school_service_1.schoolService.updateMe(req.user.schoolId ?? null, req.user.sub, req.body);
            (0, response_1.sendSuccess)(res, { school });
        }
        catch (err) {
            next(err);
        }
    },
};
