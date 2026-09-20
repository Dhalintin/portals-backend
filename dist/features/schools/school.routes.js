"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/features/schools/school.routes.ts
const express_1 = require("express");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorize_1 = require("../../common/middleware/authorize");
const authorize_2 = require("../../common/middleware/authorize"); // or separate file
const validate_1 = require("../../common/middleware/validate");
const school_controller_1 = require("./school.controller");
const school_dto_1 = require("./school.dto");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate, authorize_2.requireSchoolContext);
router.get("/me", (0, authorize_1.authorize)("SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"), school_controller_1.schoolController.getMe);
router.patch("/me", (0, authorize_1.authorize)("SCHOOL_ADMIN"), // only admins change branding/settings
(0, validate_1.validate)({ body: school_dto_1.updateSchoolBodySchema }), school_controller_1.schoolController.updateMe);
exports.default = router;
