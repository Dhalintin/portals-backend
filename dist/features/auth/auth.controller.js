"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const auth_service_1 = require("./auth.service");
exports.authController = {
    async login(req, res, next) {
        try {
            const body = req.body;
            const result = await auth_service_1.authService.login(body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async register(req, res, next) {
        try {
            const body = req.body;
            const result = await auth_service_1.authService.register(body);
            // 201 Created
            (0, response_1.sendSuccess)(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    },
    async googleAuth(req, res, next) {
        try {
            const result = await auth_service_1.authService.googleAuth(req.body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async createOrganization(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await auth_service_1.authService.createOrganization(req.user.sub, req.body);
            (0, response_1.sendSuccess)(res, result, 201);
        }
        catch (err) {
            next(err);
        }
    },
    async switchOrganization(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await auth_service_1.authService.switchOrganization(req.user.sub, req.body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async me(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const tokenCtx = {
                sub: req.user.sub,
                email: req.user.email ?? "",
                role: req.user.role,
                schoolId: req.user.schoolId ?? null,
                membershipId: req.user.membershipId ?? null,
            };
            const user = await auth_service_1.authService.me(req.user.sub, tokenCtx);
            (0, response_1.sendSuccess)(res, { user });
        }
        catch (err) {
            next(err);
        }
    },
    async logout(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const result = await auth_service_1.authService.logout(req.user.sub);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async forgotPassword(req, res, next) {
        try {
            const body = req.body;
            const result = await auth_service_1.authService.forgotPassword(body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async resetPassword(req, res, next) {
        try {
            const body = req.body;
            const result = await auth_service_1.authService.resetPassword(body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async changePassword(req, res, next) {
        try {
            if (!req.user)
                throw new AppError_1.UnauthorizedError();
            const body = req.body;
            const result = await auth_service_1.authService.changePassword(req.user.sub, body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
};
