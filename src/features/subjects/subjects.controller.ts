import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { subjectsService } from "./subjects.service";

export class SubjectsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals.validated;
      const data = await subjectsService.list(getSchoolId(req), query as never);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subjectsService.get(
        getSchoolId(req),
        req.params.subjectId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subjectsService.create(getSchoolId(req), req.body);
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subjectsService.update(
        getSchoolId(req),
        req.params.subjectId as string,
        req.body
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await subjectsService.archive(
        getSchoolId(req),
        req.params.subjectId as string
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}

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
