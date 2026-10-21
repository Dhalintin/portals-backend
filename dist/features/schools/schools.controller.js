"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchoolsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const schools_service_1 = require("./schools.service");
class SchoolsController {
    onboarding = async (req, res, next) => {
        try {
            return (0, http_1.sendSuccess)(res, await schools_service_1.schoolsService.getOnboarding((0, requireSchool_1.getSchoolId)(req)));
        }
        catch (error) {
            return next(error);
        }
    };
    get = async (req, res, next) => {
        try {
            const data = await schools_service_1.schoolsService.getProfile((0, requireSchool_1.getSchoolId)(req));
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    updateProfile = async (req, res, next) => {
        try {
            const data = await schools_service_1.schoolsService.updateProfile((0, requireSchool_1.getSchoolId)(req), req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    updateBranding = async (req, res, next) => {
        try {
            const data = await schools_service_1.schoolsService.updateBranding((0, requireSchool_1.getSchoolId)(req), req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    updateSlug = async (req, res, next) => {
        try {
            const data = await schools_service_1.schoolsService.updateSlug((0, requireSchool_1.getSchoolId)(req), req.auth.userId, req.body.slug, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    completeOnboarding = async (req, res, next) => {
        try {
            const data = await monorepoSafeOnboarding(req);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.SchoolsController = SchoolsController;
async function monorepoSafeOnboarding(req) {
    return schools_service_1.schoolsService.completeOnboarding((0, requireSchool_1.getSchoolId)(req), req.auth.userId);
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
