"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academic_sessions_controller_1 = require("./academic-sessions.controller");
const academic_sessions_dto_1 = require("./academic-sessions.dto");
const client_1 = require("@prisma/client");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const validate_1 = require("../../common/middleware/validate");
const staff = [
    client_1.OrgRole.SCHOOL_ADMIN,
    client_1.OrgRole.TEACHER,
    client_1.OrgRole.EXAM_OFFICER,
];
const managers = [client_1.OrgRole.SCHOOL_ADMIN, client_1.OrgRole.EXAM_OFFICER];
const academicSessionRoutes = (0, express_1.Router)();
academicSessionRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
/** GET /sessions — list with nested terms */
academicSessionRoutes.get("/", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ query: academic_sessions_dto_1.listSessionsQuerySchema }), academic_sessions_controller_1.academicSessionsController.list);
/** GET /sessions/current — default for Results page */
academicSessionRoutes.get("/current", (0, authorize_1.authorize)(...staff), academic_sessions_controller_1.academicSessionsController.current);
/** GET /sessions/terms/:termId — resolve one term */
academicSessionRoutes.get("/terms/:termId", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: academic_sessions_dto_1.termIdParamSchema }), academic_sessions_controller_1.academicSessionsController.getTerm);
/** PATCH /sessions/terms/:termId — set current term / dates */
academicSessionRoutes.patch("/terms/:termId", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: academic_sessions_dto_1.termIdParamSchema, body: academic_sessions_dto_1.updateTermBodySchema }), academic_sessions_controller_1.academicSessionsController.updateTerm);
academicSessionRoutes.get("/:id", (0, authorize_1.authorize)(...staff), (0, validate_1.validate)({ params: academic_sessions_dto_1.sessionIdParamSchema }), academic_sessions_controller_1.academicSessionsController.getById);
academicSessionRoutes.post("/", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ body: academic_sessions_dto_1.createSessionBodySchema }), academic_sessions_controller_1.academicSessionsController.create);
academicSessionRoutes.patch("/:id", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: academic_sessions_dto_1.sessionIdParamSchema, body: academic_sessions_dto_1.updateSessionBodySchema }), academic_sessions_controller_1.academicSessionsController.update);
academicSessionRoutes.delete("/:id", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: academic_sessions_dto_1.sessionIdParamSchema }), academic_sessions_controller_1.academicSessionsController.remove);
exports.default = academicSessionRoutes;
