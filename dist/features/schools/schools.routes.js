"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const bankAccount_1 = require("./bankAccount");
const http_1 = require("../../lib/http");
const express_1 = require("express");
// import { authenticate } from "../../middleware/authenticate";
// import { requireSchool } from "../../middleware/requireSchool";
// import { requirePermission } from "../../middleware/requirePermission";
// import { validate } from "../../middleware/validate";
const permissions_1 = require("../../auth/permissions");
const schools_validation_1 = require("./schools.validation");
const schools_controller_1 = require("./schools.controller");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const c = new schools_controller_1.SchoolsController();
const schoolsRoutes = (0, express_1.Router)();
schoolsRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
const bankLimit = (0, express_rate_limit_1.default)({ windowMs: 3600000, limit: 20, keyGenerator: req => req.auth.userId, standardHeaders: true, legacyHeaders: false });
schoolsRoutes.get('/bank-account', async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, bankAccount_1.readBankAccount)(req.auth));
}
catch (e) {
    next(e);
} });
schoolsRoutes.post('/bank-account/request', bankLimit, async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, bankAccount_1.requestBankChange)(req.auth, req.body));
}
catch (e) {
    next(e);
} });
schoolsRoutes.post('/bank-account/confirm', bankLimit, async (req, res, next) => { try {
    (0, http_1.sendSuccess)(res, await (0, bankAccount_1.confirmBankChange)(req.auth, req.body));
}
catch (e) {
    next(e);
} });
schoolsRoutes.get("/", c.get);
schoolsRoutes.get("/onboarding", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["settings:write"]), c.onboarding);
schoolsRoutes.patch("/profile", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["settings:write"]), (0, validate_1.validate)(schools_validation_1.updateSchoolProfileSchema), c.updateProfile);
schoolsRoutes.patch("/branding", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["settings:write"]), (0, validate_1.validate)(schools_validation_1.updateSchoolBrandingSchema), c.updateBranding);
schoolsRoutes.patch("/slug", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["settings:write"]), (0, validate_1.validate)(schools_validation_1.updateSchoolSlugSchema), c.updateSlug);
schoolsRoutes.post("/onboarding/complete", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["settings:write"]), c.completeOnboarding);
exports.default = schoolsRoutes;
// // src/features/schools/school.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import { authorize } from "../../common/middleware/authorize";
// import { requireSchoolContext } from "../../common/middleware/authorize"; // or separate file
// import { validate } from "../../common/middleware/validate";
// import { schoolController } from "./schools.controller";
// import { updateSchoolBodySchema } from "./school.dto";
// const router = Router();
// router.use(authenticate, requireSchoolContext);
// router.get(
//   "/me",
//   authorize("SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"),
//   schoolController.getMe
// );
// router.patch(
//   "/me",
//   authorize("SCHOOL_ADMIN"), // only admins change branding/settings
//   validate({ body: updateSchoolBodySchema }),
//   schoolController.updateMe
// );
// export default router;
