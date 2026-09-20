"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicResultsRouter = void 0;
const express_1 = require("express");
const results_controller_1 = require("./results.controller");
const results_dto_1 = require("./results.dto");
const client_1 = require("@prisma/client");
const authenticate_1 = require("../../common/middleware/authenticate");
const validate_1 = require("../../common/middleware/validate");
const authorize_1 = require("../../common/middleware/authorize");
const staff = [
    client_1.OrgRole.SCHOOL_ADMIN,
    client_1.OrgRole.TEACHER,
    client_1.OrgRole.EXAM_OFFICER,
];
const publishers = [client_1.OrgRole.SCHOOL_ADMIN, client_1.OrgRole.EXAM_OFFICER];
const resultRoutes = (0, express_1.Router)();
/**
 * Public parent verify — mount at /api/v1/public/results (no auth).
 * Keep rate limiting on this path.
 */
exports.publicResultsRouter = (0, express_1.Router)();
exports.publicResultsRouter.post("/verify", (0, validate_1.validate)({ body: results_dto_1.verifyResultBodySchema }), results_controller_1.resultsController.verifyPublic);
/** School-scoped results API — mount at /api/v1/results */
resultRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
resultRoutes.get("/", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ query: results_dto_1.listResultsQuerySchema }), results_controller_1.resultsController.list);
resultRoutes.get("/stats", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ query: results_dto_1.resultsStatsQuerySchema }), results_controller_1.resultsController.stats);
resultRoutes.get("/entry-sheet", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ query: results_dto_1.classTermSubjectQuerySchema }), results_controller_1.resultsController.entrySheet);
resultRoutes.get("/student/:studentId/term/:termId", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: results_dto_1.studentTermParamsSchema }), results_controller_1.resultsController.getByStudentTerm);
resultRoutes.put("/student/:studentId/term/:termId/scores", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: results_dto_1.studentTermParamsSchema, body: results_dto_1.upsertScoresBodySchema }), results_controller_1.resultsController.upsertStudentScores);
resultRoutes.put("/bulk-scores", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ body: results_dto_1.bulkScoresBodySchema }), results_controller_1.resultsController.bulkSubjectScores);
resultRoutes.post("/publish", (0, authorize_1.authorize)(...publishers), (0, validate_1.validate)({ body: results_dto_1.publishResultsBodySchema }), results_controller_1.resultsController.publish);
resultRoutes.post("/recalculate-positions", (0, authorize_1.authorize)(...publishers), (0, validate_1.validate)({ body: results_dto_1.recalculatePositionsBodySchema }), results_controller_1.resultsController.recalculatePositions);
resultRoutes.get("/:id", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: results_dto_1.resultIdParamSchema }), results_controller_1.resultsController.getById);
resultRoutes.patch("/:id", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: results_dto_1.resultIdParamSchema, body: results_dto_1.updateResultBodySchema }), results_controller_1.resultsController.updateMeta);
exports.default = resultRoutes;
