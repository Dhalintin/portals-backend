import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { classesService } from "./classes.service";

export class ClassesController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals.validated;
      const data = await classesService.list(getSchoolId(req), query as never);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.get(
        getSchoolId(req),
        req.params.classId as string
      );
      console.log(data);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.create(getSchoolId(req), req.body);
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.update(
        getSchoolId(req),
        req.params.classId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  assignClassTeacher = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await classesService.assignClassTeacher(
        getSchoolId(req),
        req.params.classId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  listSubjects = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.listSubjects(
        getSchoolId(req),
        req.params.classId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  addSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.addSubject(
        getSchoolId(req),
        req.params.classId as string,
        req.body
      );
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  removeSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await classesService.removeSubject(
        getSchoolId(req),
        req.params.classId as string,
        req.params.subjectId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  assignSubjectTeacher = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await classesService.assignSubjectTeacher(
        getSchoolId(req),
        req.params.classId as string,
        req.params.subjectId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  removeSubjectTeacher = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await classesService.removeSubjectTeacher(
        getSchoolId(req),
        req.params.classId as string,
        req.params.subjectId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}

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
