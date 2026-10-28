"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// import { validate } from "../../middleware/validate";
// import { authenticate } from "../../middleware/authenticate";
const auth_validation_1 = require("./auth.validation");
const auth_controller_1 = require("./auth.controller");
const validate_1 = require("../../middlewares/validate");
const authenticate_1 = require("../../middlewares/authenticate");
const rateLimit_1 = require("../../middlewares/rateLimit");
const invitations_service_1 = require("./invitations.service");
const http_1 = require("../../lib/http");
const auth_validation_2 = require("./auth.validation");
const googleAuth_1 = require("./googleAuth");
const auth_sessions_1 = require("./auth.sessions");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const profile_service_1 = require("./profile.service");
const c = new auth_controller_1.AuthController();
const router = (0, express_1.Router)();
router.get("/google/config", (_req, res) => (0, http_1.sendSuccess)(res, { clientId: process.env.GOOGLE_CLIENT_ID || null }));
router.post("/google", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_2.googleLoginSchema), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await (0, googleAuth_1.googleLogin)(req.body.idToken, req.body.nonce, req.body.schoolSlug));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/complete", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_2.completeInvitationSchema), async (req, res, next) => {
    try {
        const result = await invitations_service_1.invitationsService.accept(req.body.token, req.body.password, undefined, req.body.currentPassword, req.body.firstName && req.body.lastName ? { firstName: req.body.firstName, lastName: req.body.lastName } : undefined);
        (0, http_1.sendSuccess)(res, await auth_sessions_1.authSessions.create(result.userId, result.schoolId, result.authVersion));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/accept-google", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_2.googleInvitationSchema), async (req, res, next) => {
    try {
        const google = await (0, googleAuth_1.verifiedGoogleProfile)(req.body.idToken, req.body.nonce);
        const result = await invitations_service_1.invitationsService.accept(req.body.token, undefined, undefined, undefined, { firstName: google.firstName, lastName: google.lastName, google });
        (0, http_1.sendSuccess)(res, await auth_sessions_1.authSessions.create(result.userId, result.schoolId, result.authVersion));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/inspect", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.acceptExistingInvitationSchema), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await invitations_service_1.invitationsService.inspect(req.body.token));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/accept-existing-password", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.acceptExistingPasswordInvitationSchema), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await invitations_service_1.invitationsService.accept(req.body.token, undefined, undefined, req.body.currentPassword));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/accept", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.acceptInvitationSchema), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await invitations_service_1.invitationsService.accept(req.body.token, req.body.password));
    }
    catch (error) {
        next(error);
    }
});
router.post("/invitations/accept-existing", rateLimit_1.authLimiter, authenticate_1.authenticate, (0, validate_1.validate)(auth_validation_1.acceptExistingInvitationSchema), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await invitations_service_1.invitationsService.accept(req.body.token, undefined, req.auth.userId));
    }
    catch (error) {
        next(error);
    }
});
router.post("/register", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.registerSchoolAdminSchema), c.register);
router.post("/login", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.loginSchema), c.login);
router.post("/refresh", rateLimit_1.refreshLimiter, (0, validate_1.validate)(auth_validation_1.refreshSchema), c.refresh);
router.post("/logout", authenticate_1.authenticate, c.logout);
router.post("/logout-all", authenticate_1.authenticate, c.logoutAll);
router.get("/me", authenticate_1.authenticate, c.me);
router.get("/profile", authenticate_1.authenticate, async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await (0, profile_service_1.ownProfile)(req.auth));
    }
    catch (error) {
        next(error);
    }
});
router.patch("/profile", authenticate_1.authenticate, async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await (0, profile_service_1.updateOwnProfile)(req.auth, req.body));
    }
    catch (error) {
        next(error);
    }
});
const accountLimit = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: req => req.auth.userId,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many password attempts. Try again later." } } });
router.post("/change-password", authenticate_1.authenticate, accountLimit, async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await (0, profile_service_1.changeOwnPassword)(req.auth, req.body));
    }
    catch (error) {
        next(error);
    }
});
router.post("/forgot-password", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.forgotPasswordSchema), c.forgotPassword);
router.post("/reset-password", rateLimit_1.authLimiter, (0, validate_1.validate)(auth_validation_1.resetPasswordSchema), c.resetPassword);
exports.default = router;
// // src/features/auth/auth.routes.ts
// import { Router } from "express";
// import { validate } from "../../common/middleware/validate";
// import { authenticate } from "../../common/middleware/authenticate";
// import { authController } from "./auth.controller";
// import {
//   changePasswordBodySchema,
//   createOrganizationBodySchema,
//   forgotPasswordBodySchema,
//   googleAuthBodySchema,
//   loginBodySchema,
//   registerBodySchema,
//   resetPasswordBodySchema,
//   switchOrganizationBodySchema,
// } from "./auth.dto";
// const router = Router();
// router.post(
//   "/register",
//   validate({ body: registerBodySchema }),
//   authController.register
// );
// router.post(
//   "/login",
//   validate({ body: loginBodySchema }),
//   authController.login
// );
// router.post(
//   "/google",
//   validate({ body: googleAuthBodySchema }),
//   authController.googleAuth
// );
// router.post(
//   "/forgot-password",
//   validate({ body: forgotPasswordBodySchema }),
//   authController.forgotPassword
// );
// router.post(
//   "/reset-password",
//   validate({ body: resetPasswordBodySchema }),
//   authController.resetPassword
// );
// router.get("/me", authenticate, authController.me);
// router.post("/logout", authenticate, authController.logout);
// router.post(
//   "/change-password",
//   authenticate,
//   validate({ body: changePasswordBodySchema }),
//   authController.changePassword
// );
// router.post(
//   "/organizations",
//   authenticate,
//   validate({ body: createOrganizationBodySchema }),
//   authController.createOrganization
// );
// router.post(
//   "/switch-organization",
//   authenticate,
//   validate({ body: switchOrganizationBodySchema }),
//   authController.switchOrganization
// );
// export default router;
