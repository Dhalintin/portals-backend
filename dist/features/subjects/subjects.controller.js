"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const subjects_service_1 = require("./subjects.service");
class SubjectsController {
    list = async (req, res, next) => {
        try {
            const query = res.locals.validated;
            const data = await subjects_service_1.subjectsService.list((0, requireSchool_1.getSchoolId)(req), query);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    get = async (req, res, next) => {
        try {
            const data = await subjects_service_1.subjectsService.get((0, requireSchool_1.getSchoolId)(req), req.params.subjectId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const data = await subjects_service_1.subjectsService.create((0, requireSchool_1.getSchoolId)(req), req.body);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await subjects_service_1.subjectsService.update((0, requireSchool_1.getSchoolId)(req), req.params.subjectId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    archive = async (req, res, next) => {
        try {
            const data = await subjects_service_1.subjectsService.archive((0, requireSchool_1.getSchoolId)(req), req.params.subjectId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.SubjectsController = SubjectsController;
// import type { Request, Response, NextFunction } from "express";
// import { sendSuccess, sendCreated } from "../../common/http/response";
// import { UnauthorizedError } from "../../common/errors/AppError";
// import { subjectService } from "./subjects.service";
// import type {
//   CreateSubjectBody,
//   ListSubjectsQuery,
//   UpdateSubjectBody,
// } from "./subject.dto";
// export const subjectController = {
//   async list(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await subjectService.list(
//         req.user.schoolId ?? null,
//         req.query as unknown as ListSubjectsQuery
//       );
//       sendSuccess(res, { items: result.items, meta: result.meta });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async getById(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const subject = await subjectService.getById(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { subject });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async create(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const subject = await subjectService.create(
//         req.user.schoolId ?? null,
//         req.body as CreateSubjectBody
//       );
//       sendCreated(res, { subject });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async update(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const subject = await subjectService.update(
//         req.user.schoolId ?? null,
//         req.params.id as string,
//         req.body as UpdateSubjectBody
//       );
//       sendSuccess(res, { subject });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async remove(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const subject = await subjectService.remove(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { subject });
//     } catch (err) {
//       next(err);
//     }
//   },
// };
