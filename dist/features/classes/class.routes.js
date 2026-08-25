"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/features/classes/class.routes.ts
const express_1 = require("express");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const validate_1 = require("../../common/middleware/validate");
const class_controller_1 = require("./class.controller");
const class_dto_1 = require("./class.dto");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
router.get("/", (0, authorize_1.authorize)("school_admin", "teacher", "exam_officer"), (0, validate_1.validate)({ query: class_dto_1.listClassesQuerySchema }), class_controller_1.classController.list);
router.post("/", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ body: class_dto_1.createClassBodySchema }), class_controller_1.classController.create);
router.get("/:id", (0, authorize_1.authorize)("school_admin", "teacher", "exam_officer"), (0, validate_1.validate)({ params: class_dto_1.classIdParamsSchema }), class_controller_1.classController.getById);
router.patch("/:id", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ params: class_dto_1.classIdParamsSchema, body: class_dto_1.updateClassBodySchema }), class_controller_1.classController.update);
router.delete("/:id", (0, authorize_1.authorize)("school_admin"), (0, validate_1.validate)({ params: class_dto_1.classIdParamsSchema }), class_controller_1.classController.remove);
exports.default = router;
