"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherController = void 0;
const response_1 = require("../../common/http/response");
const AppError_1 = require("../../common/errors/AppError");
const invitations_service_1 = require("../auth/invitations.service");
const teacher_service_1 = require("./teacher.service");
exports.teacherController = {
    async list(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const result = await teacher_service_1.teacherService.list(req.auth.schoolId ?? null, req.query);
            (0, response_1.sendSuccess)(res, { items: result.items, meta: result.meta });
        }
        catch (err) {
            next(err);
        }
    },
    async getById(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const teacher = await teacher_service_1.teacherService.getById(req.auth.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { teacher });
        }
        catch (err) {
            next(err);
        }
    },
    async invite(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const invitation = await invitations_service_1.invitationsService.create(req.auth.schoolId, req.auth.userId, { ...req.body, phone: req.body.phone ?? undefined }, req.requestId);
            (0, response_1.sendCreated)(res, { invitation });
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const teacher = await teacher_service_1.teacherService.update(req.auth.schoolId ?? null, req.params.id, req.body);
            (0, response_1.sendSuccess)(res, { teacher });
        }
        catch (err) {
            next(err);
        }
    },
    async remove(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const teacher = await teacher_service_1.teacherService.remove(req.auth.schoolId ?? null, req.params.id);
            (0, response_1.sendSuccess)(res, { teacher });
        }
        catch (err) {
            next(err);
        }
    },
    async setAssignments(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const teacher = await teacher_service_1.teacherService.setAssignments(req.auth.schoolId ?? null, req.params.id, req.body);
            (0, response_1.sendSuccess)(res, { teacher });
        }
        catch (err) {
            next(err);
        }
    },
    async myAssignments(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const teacher = await teacher_service_1.teacherService.getMyAssignments(req.auth.schoolId ?? null, req.auth.userId);
            (0, response_1.sendSuccess)(res, { teacher });
        }
        catch (err) {
            next(err);
        }
    },
    async setClassTeacher(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const result = await teacher_service_1.teacherService.setClassTeacher(req.auth.schoolId ?? null, req.params.classId, req.body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async setClassSubjectTeacher(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const result = await teacher_service_1.teacherService.setClassSubjectTeacher(req.auth.schoolId ?? null, req.params.classId, req.body);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
    async listClassSubjectTeachers(req, res, next) {
        try {
            if (!req.auth)
                throw new AppError_1.UnauthorizedError();
            const result = await teacher_service_1.teacherService.listClassSubjectTeachers(req.auth.schoolId ?? null, req.params.classId);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (err) {
            next(err);
        }
    },
};
