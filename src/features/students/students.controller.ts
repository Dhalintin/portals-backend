import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { studentsService } from "./students.service";
import { BulkCreateStudentsInput } from "./students.validation";

export class StudentsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals.validated;
      const data = await studentsService.list(getSchoolId(req), query as never, req.auth!);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.get(
        getSchoolId(req),
        req.params.studentId as string,
        req.auth!
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.create(
        getSchoolId(req),
        req.auth!.userId,
        req.body,
        req.requestId
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  bulkCreate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = res.locals.validated as BulkCreateStudentsInput;

      const data = await studentsService.bulkCreate(
        getSchoolId(req),
        req.auth!.userId,
        input,
        req.requestId
      );

      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.update(
        getSchoolId(req),
        req.params.studentId as string,
        req.auth!.userId,
        req.body,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.archive(
        getSchoolId(req),
        req.params.studentId as string,
        req.auth!.userId,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  enroll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.enroll(
        getSchoolId(req),
        req.params.studentId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  exportRows = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await studentsService.exportRows(getSchoolId(req), req.auth!);
      return sendSuccess(res, { rows: data });
    } catch (e) {
      return next(e);
    }
  };
} // // src/features/students/student.controller.ts
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
