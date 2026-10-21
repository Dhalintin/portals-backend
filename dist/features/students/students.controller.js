"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const students_service_1 = require("./students.service");
class StudentsController {
    list = async (req, res, next) => {
        try {
            const query = res.locals.validated;
            const data = await students_service_1.studentsService.list((0, requireSchool_1.getSchoolId)(req), query, req.auth);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    get = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.get((0, requireSchool_1.getSchoolId)(req), req.params.studentId, req.auth);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.create((0, requireSchool_1.getSchoolId)(req), req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    bulkCreate = async (req, res, next) => {
        try {
            const input = res.locals.validated;
            const data = await students_service_1.studentsService.bulkCreate((0, requireSchool_1.getSchoolId)(req), req.auth.userId, input, req.requestId);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.update((0, requireSchool_1.getSchoolId)(req), req.params.studentId, req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    archive = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.archive((0, requireSchool_1.getSchoolId)(req), req.params.studentId, req.auth.userId, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    enroll = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.enroll((0, requireSchool_1.getSchoolId)(req), req.params.studentId, req.body);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    exportRows = async (req, res, next) => {
        try {
            const data = await students_service_1.studentsService.exportRows((0, requireSchool_1.getSchoolId)(req), req.auth);
            return (0, http_1.sendSuccess)(res, { rows: data });
        }
        catch (e) {
            return next(e);
        }
    };
} // // src/features/students/student.controller.ts
exports.StudentsController = StudentsController;
// import type { Request, Response, NextFunction } from "express";
// import { sendSuccess } from "../../common/http/response";
// import { UnauthorizedError } from "../../common/errors/AppError";
// import { studentService } from "./students.service";
// import type {
//   BulkCreateStudentsBody,
//   CreateStudentBody,
//   ListStudentsQuery,
//   UpdateStudentBody,
// } from "./student.dto";
// export const studentController = {
//   async list(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await studentService.list(
//         req.user.schoolId ?? null,
//         req.query as unknown as ListStudentsQuery
//       );
//       sendSuccess(res, {
//         items: result.items,
//         meta: result.meta,
//       });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async getById(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const student = await studentService.getById(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { student });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async create(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const student = await studentService.create(
//         req.user.schoolId ?? null,
//         req.body as CreateStudentBody
//       );
//       sendSuccess(res, { student }, 201);
//     } catch (err) {
//       next(err);
//     }
//   },
//   async update(req: Request, res: Response, next: NextFunction) {
//     console.log("Updating record!");
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const student = await studentService.update(
//         req.user.schoolId ?? null,
//         req.params.id as string,
//         req.body as UpdateStudentBody
//       );
//       sendSuccess(res, { student });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async remove(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const student = await studentService.remove(
//         req.user.schoolId ?? null,
//         req.params.id as string
//       );
//       sendSuccess(res, { student });
//     } catch (err) {
//       next(err);
//     }
//   },
//   async bulkCreate(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await studentService.bulkCreate(
//         req.user.schoolId ?? null,
//         req.body as BulkCreateStudentsBody
//       );
//       sendSuccess(res, result, 201);
//     } catch (err) {
//       next(err);
//     }
//   },
// };
