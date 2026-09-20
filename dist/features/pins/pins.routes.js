"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPinsRouter = void 0;
const express_1 = require("express");
const pins_controller_1 = require("./pins.controller");
// import { authenticate } from "../../middleware/authenticate";
// import { authorize } from "../../middleware/authorize";
// import { requireSchoolContext } from "../../middleware/requireSchoolContext";
// import { validate } from "../../middleware/validate";
const pins_dto_1 = require("./pins.dto");
const client_1 = require("@prisma/client");
const authorize_1 = require("../../common/middleware/authorize");
const authenticate_1 = require("../../common/middleware/authenticate");
const validate_1 = require("../../common/middleware/validate");
const staff = [client_1.OrgRole.SCHOOL_ADMIN, client_1.OrgRole.TEACHER, client_1.OrgRole.EXAM_OFFICER];
const managers = [client_1.OrgRole.SCHOOL_ADMIN, client_1.OrgRole.EXAM_OFFICER];
const pinRoutes = (0, express_1.Router)();
/** Public — mount at /api/v1/public/pins (rate-limit this) */
exports.publicPinsRouter = (0, express_1.Router)();
exports.publicPinsRouter.post("/verify", (0, validate_1.validate)({ body: pins_dto_1.verifyPinBodySchema }), pins_controller_1.pinsController.verifyPublic);
/** School-scoped — mount at /api/v1/pins */
pinRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
pinRoutes.get("/", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ query: pins_dto_1.listPinsQuerySchema }), pins_controller_1.pinsController.list);
pinRoutes.get("/stats", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ query: pins_dto_1.pinsStatsQuerySchema }), pins_controller_1.pinsController.stats);
pinRoutes.post("/generate", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ body: pins_dto_1.generatePinsBodySchema }), pins_controller_1.pinsController.generate);
pinRoutes.get("/:id", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: pins_dto_1.pinIdParamSchema }), pins_controller_1.pinsController.getById);
pinRoutes.patch("/:id", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: pins_dto_1.pinIdParamSchema, body: pins_dto_1.updatePinBodySchema }), pins_controller_1.pinsController.update);
pinRoutes.post("/:id/disable", (0, authorize_1.authorize)(...managers), (0, validate_1.validate)({ params: pins_dto_1.pinIdParamSchema }), pins_controller_1.pinsController.disable);
exports.default = pinRoutes;
