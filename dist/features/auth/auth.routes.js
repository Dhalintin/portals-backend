"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/features/auth/auth.routes.ts
const express_1 = require("express");
const validate_1 = require("../../common/middleware/validate");
const authenticate_1 = require("../../common/middleware/authenticate");
const auth_controller_1 = require("./auth.controller");
const auth_dto_1 = require("./auth.dto");
const router = (0, express_1.Router)();
router.post("/register", (0, validate_1.validate)({ body: auth_dto_1.registerBodySchema }), auth_controller_1.authController.register);
router.post("/login", (0, validate_1.validate)({ body: auth_dto_1.loginBodySchema }), auth_controller_1.authController.login);
router.post("/google", (0, validate_1.validate)({ body: auth_dto_1.googleAuthBodySchema }), auth_controller_1.authController.googleAuth);
router.post("/forgot-password", (0, validate_1.validate)({ body: auth_dto_1.forgotPasswordBodySchema }), auth_controller_1.authController.forgotPassword);
router.post("/reset-password", (0, validate_1.validate)({ body: auth_dto_1.resetPasswordBodySchema }), auth_controller_1.authController.resetPassword);
router.get("/me", authenticate_1.authenticate, auth_controller_1.authController.me);
router.post("/logout", authenticate_1.authenticate, auth_controller_1.authController.logout);
router.post("/change-password", authenticate_1.authenticate, (0, validate_1.validate)({ body: auth_dto_1.changePasswordBodySchema }), auth_controller_1.authController.changePassword);
exports.default = router;
