"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultsController = exports.ResultsController = void 0;
const results_service_1 = require("./results.service");
const results_validation_1 = require("./results.validation");
// import { sendSuccess } from "../../lib/response/http";
const errors_1 = require("../../lib/errors");
const http_1 = require("../../lib/http");
const resourceAccess_1 = require("../../auth/resourceAccess");
const prisma_1 = require("../../lib/prisma");
class ResultsController {
    entrySheet = async (req, res, next) => {
        try {
            const input = results_validation_1.entrySheetQuerySchema.parse(req.query);
            (0, http_1.sendSuccess)(res, await results_service_1.resultsService.entrySheet(req.auth.schoolId, req.auth.userId, input));
        }
        catch (error) {
            next(error);
        }
    };
    parentReportCard = async (req, res, next) => {
        try {
            const result = await results_service_1.resultsService.getResult(req.auth.schoolId, req.params.id);
            await (0, resourceAccess_1.assertParentChildAccess)(req.auth, result.studentId);
            if (!result.isPublished || result.status !== "PUBLISHED") {
                throw new errors_1.AppError(404, "NOT_FOUND", "Published report card not found");
            }
            (0, http_1.sendSuccess)(res, await results_service_1.resultsService.reportCardPayload(req.auth.schoolId, result.id));
        }
        catch (error) {
            next(error);
        }
    };
    getGradeScale = async (req, res, next) => {
        try {
            const data = await results_service_1.resultsService.getGradeScale(req.auth.schoolId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    upsertGradeScale = async (req, res, next) => {
        try {
            const input = results_validation_1.upsertGradeScaleSchema.parse(req.body);
            const data = await results_service_1.resultsService.upsertGradeScale(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getOrCreateSheet = async (req, res, next) => {
        try {
            const input = results_validation_1.createResultSheetSchema.parse(req.body);
            const student = await prisma_1.prisma.student.findFirst({ where: { id: input.studentId, organizationId: req.auth.schoolId } });
            if (!student?.classId)
                throw new errors_1.AppError(400, "CLASS_REQUIRED", "Student must be assigned to this school's class");
            await (0, resourceAccess_1.assertTeachingAccess)(req.auth.schoolId, req.auth.userId, student.classId);
            const data = await results_service_1.resultsService.getOrCreateResultSheet(req.auth.schoolId, input.studentId, input.termId, input.classId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    bulkCreateSheets = async (req, res, next) => {
        try {
            const input = results_validation_1.bulkCreateResultSheetsSchema.parse(req.body);
            await (0, resourceAccess_1.assertTeachingAccess)(req.auth.schoolId, req.auth.userId, input.classId);
            const data = await results_service_1.resultsService.bulkCreateSheetsForClass(req.auth.schoolId, input.termId, input.classId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    upsertScores = async (req, res, next) => {
        try {
            const input = results_validation_1.upsertScoresSchema.parse(req.body);
            const data = await results_service_1.resultsService.upsertScores(req.auth.schoolId, input.resultId, input.scores, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    bulkScores = async (req, res, next) => {
        try {
            const input = results_validation_1.bulkScoresByClassSubjectSchema.parse(req.body);
            const data = await results_service_1.resultsService.bulkScoresByClassSubject(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    transition = async (req, res, next) => {
        try {
            const input = results_validation_1.transitionResultSchema.parse(req.body);
            if ((input.status === "APPROVED" || input.status === "PUBLISHED") &&
                !req.auth.permissions.includes("results:publish")) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Result approval or publishing permission required");
            }
            const data = await results_service_1.resultsService.transitionStatus(req.auth.schoolId, req.params.id, input.status, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    publishClass = async (req, res, next) => {
        try {
            const input = results_validation_1.publishClassTermSchema.parse(req.body);
            const data = await results_service_1.resultsService.publishClassTerm(req.auth.schoolId, input.termId, input.classId, input.publish, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    recalculatePositions = async (req, res, next) => {
        try {
            const { termId, classId } = req.body;
            if (!termId || !classId) {
                throw new errors_1.AppError(400, "VALIDATION_ERROR", "termId and classId required");
            }
            const data = await results_service_1.resultsService.recalculatePositions(req.auth.schoolId, termId, classId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getOne = async (req, res, next) => {
        try {
            const data = await results_service_1.resultsService.getResult(req.auth.schoolId, req.params.id, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    list = async (req, res, next) => {
        try {
            const query = results_validation_1.listResultsQuerySchema.parse(req.query);
            const data = await results_service_1.resultsService.listResults(req.auth.schoolId, query, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    parentResults = async (req, res, next) => {
        try {
            const data = await results_service_1.resultsService.parentResults(req.auth.schoolId, req.auth.userId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    reportCard = async (req, res, next) => {
        try {
            const data = await results_service_1.resultsService.reportCardPayload(req.auth.schoolId, req.params.id, req.auth);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.ResultsController = ResultsController;
exports.resultsController = new ResultsController();
// import { Request, Response, NextFunction } from "express";
// import { resultsService } from "./results.service";
// import { sendSuccess } from "../../common/http/response";
// import type {
//   BulkScoresBody,
//   ListResultsQuery,
//   PublishResultsBody,
//   RecalculatePositionsBody,
//   ResultsStatsQuery,
//   UpdateResultBody,
//   UpsertScoresBody,
//   VerifyResultBody,
// } from "./results.dto";
// function actorFromReq(req: Request) {
//   const user = req.user as {
//     sub: string;
//     role?: string;
//     orgRole?: string;
//     schoolId?: string;
//   };
//   const schoolId =
//     (req as any).schoolId ??
//     user.schoolId ??
//     (req.headers["x-school-id"] as string | undefined);
//   if (!user?.sub || !schoolId) {
//     throw new Error("Missing auth or school context"); // your AppError.Unauthorized ideally
//   }
//   return {
//     userId: user.sub,
//     globalRole: user.role,
//     orgRole: user.orgRole as any,
//     schoolId,
//   };
// }
// export class ResultsController {
//   list = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.list(
//         actor.schoolId,
//         req.query as unknown as ListResultsQuery
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   getById = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.getById(
//         actor.schoolId,
//         req.params.id as string
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   getByStudentTerm = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.getByStudentAndTerm(
//         actor.schoolId,
//         req.params.studentId as string,
//         req.params.termId as string
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   entrySheet = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const { classId, termId, subjectId } = req.query as {
//         classId: string;
//         termId: string;
//         subjectId: string;
//       };
//       const data = await resultsService.getClassSubjectEntrySheet(
//         actor.schoolId,
//         classId,
//         termId,
//         subjectId,
//         actor
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   updateMeta = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.updateResultMeta(
//         actor.schoolId,
//         req.params.id as string,
//         req.body as UpdateResultBody,
//         actor
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   upsertStudentScores = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.upsertScoresForStudent(
//         actor.schoolId,
//         req.params.studentId as string,
//         req.params.termId as string,
//         req.body as UpsertScoresBody,
//         actor
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   bulkSubjectScores = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.bulkUpsertSubjectScores(
//         actor.schoolId,
//         req.body as BulkScoresBody,
//         actor
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   publish = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.publish(
//         actor.schoolId,
//         req.body as PublishResultsBody,
//         actor
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   recalculatePositions = async (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.recalculatePositions(
//         actor.schoolId,
//         req.body as RecalculatePositionsBody
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   stats = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const actor = actorFromReq(req);
//       const data = await resultsService.stats(
//         actor.schoolId,
//         req.query as unknown as ResultsStatsQuery
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
//   verifyPublic = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const ip =
//         (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
//         req.socket.remoteAddress;
//       const data = await resultsService.verifyPublic(
//         req.body as VerifyResultBody,
//         ip
//       );
//       return sendSuccess(res, data);
//     } catch (e) {
//       next(e);
//     }
//   };
// }
// export const resultsController = new ResultsController();
