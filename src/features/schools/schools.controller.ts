import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { getSchoolId } from "../../middlewares/requireSchool";
import { schoolsService } from "./schools.service";

export class SchoolsController {
  onboarding = async (req: Request, res: Response, next: NextFunction) => {
    try { return sendSuccess(res, await schoolsService.getOnboarding(getSchoolId(req))); }
    catch (error) { return next(error); }
  };
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await schoolsService.getProfile(getSchoolId(req));
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await schoolsService.updateProfile(
        getSchoolId(req),
        req.auth!.userId,
        req.body,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  updateBranding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await schoolsService.updateBranding(
        getSchoolId(req),
        req.auth!.userId,
        req.body,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  updateSlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await schoolsService.updateSlug(
        getSchoolId(req),
        req.auth!.userId,
        req.body.slug,
        req.requestId
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  completeOnboarding = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await monorepoSafeOnboarding(req);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  //   completeOnboarding = async (
  //   req: Request,
  //   res: Response,
  //   next: NextFunction
  // ) => {
  //   try {
  //     const data = await schoolsService.completeOnboarding(
  //       getSchoolId(req),
  //       req.auth!.userId
  //     );
  //     return sendSuccess(res, data);
  //   } catch (e) {
  //     return next(e);
  //   }
  // };
}

async function monorepoSafeOnboarding(req: Request) {
  return schoolsService.completeOnboarding(getSchoolId(req), req.auth!.userId);
}

// // src/features/schools/school.controller.ts
// import type { Request, Response, NextFunction } from "express";
// import { sendSuccess } from "../../common/http/response";
// import { UnauthorizedError } from "../../common/errors/AppError";
// import { schoolService } from "./school.service";
// import type { UpdateSchoolBody } from "./school.dto";

// export const schoolController = {
//   async getMe(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const school = await schoolService.getMe(req.user.schoolId ?? null);
//       sendSuccess(res, { school });
//     } catch (err) {
//       next(err);
//     }
//   },

//   async updateMe(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const school = await schoolService.updateMe(
//         req.user.schoolId ?? null,
//         req.user.sub,
//         req.body as UpdateSchoolBody
//       );
//       sendSuccess(res, { school });
//     } catch (err) {
//       next(err);
//     }
//   },
// };
