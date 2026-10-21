"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassesController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const classes_service_1 = require("./classes.service");
class ClassesController {
    list = async (req, res, next) => {
        try {
            const query = res.locals.validated;
            const data = await classes_service_1.classesService.list((0, requireSchool_1.getSchoolId)(req), query);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    get = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.get((0, requireSchool_1.getSchoolId)(req), req.params.classId);
            console.log(data);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.create((0, requireSchool_1.getSchoolId)(req), req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.update((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    assignClassTeacher = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.assignClassTeacher((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    listSubjects = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.listSubjects((0, requireSchool_1.getSchoolId)(req), req.params.classId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    addSubject = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.addSubject((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    removeSubject = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.removeSubject((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.params.subjectId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    assignSubjectTeacher = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.assignSubjectTeacher((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.params.subjectId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    removeSubjectTeacher = async (req, res, next) => {
        try {
            const data = await classes_service_1.classesService.removeSubjectTeacher((0, requireSchool_1.getSchoolId)(req), req.params.classId, req.params.subjectId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.ClassesController = ClassesController;
// // src/features/classes/class.controller.ts
// import type { Request, Response, NextFunction } from "express";
// import { sendSuccess, sendCreated } from "../../common/http/response";
// import { UnauthorizedError } from "../../common/errors/AppError";
// import { classService } from "./class.service";
// import type {
//   CreateClassBody,
//   ListClassesQuery,
//   UpdateClassBody,
// } from "./class.dto";
// export const classController = {
//   async list(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await classService.list(
//         req.user.schoolId ?? null,
//         req.query as unknown as ListClassesQuery
//       );
//       sendSuccess(res, { items: result.items }, 200, result.meta);
//       // If sendSuccess has no meta arg:
//       // sendSuccess(res, { items: result.items, meta: result.meta });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async getById(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const item = await classService.getById(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { class: item });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async create(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const item = await classService.create(
//         req.user.schoolId ?? null,
//         req.body as CreateClassBody
//       );
//       sendCreated(res, { class: item });
//       // or: sendSuccess(res, { class: item }, 201);
//     } catch (err) {
//       next(err);
//     }
//   },
//   async update(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const item = await classService.update(
//         req.user.schoolId ?? null,
//         req.params.id as string,
//         req.body as UpdateClassBody
//       );
//       sendSuccess(res, { class: item });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async remove(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const item = await classService.remove(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { class: item });
//     } catch (err) {
//       next(err);
//     }
//   },
// };
