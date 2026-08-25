// src/features/auth/auth.routes.ts
import { Router } from "express";
import { validate } from "../../common/middleware/validate";
import { authenticate } from "../../common/middleware/authenticate";
import { authController } from "./auth.controller";
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  googleAuthBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "./auth.dto";

const router = Router();

router.post(
  "/register",
  validate({ body: registerBodySchema }),
  authController.register
);

router.post(
  "/login",
  validate({ body: loginBodySchema }),
  authController.login
);

router.post(
  "/google",
  validate({ body: googleAuthBodySchema }),
  authController.googleAuth
);

router.post(
  "/forgot-password",
  validate({ body: forgotPasswordBodySchema }),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  validate({ body: resetPasswordBodySchema }),
  authController.resetPassword
);

router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, authController.logout);
router.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordBodySchema }),
  authController.changePassword
);

export default router;
