import { Router } from "express";
// import { validate } from "../../middleware/validate";
// import { authenticate } from "../../middleware/authenticate";
import {
  loginSchema,
  registerSchoolAdminSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInvitationSchema,
  acceptExistingInvitationSchema,
  acceptExistingPasswordInvitationSchema,
} from "./auth.validation";
import { AuthController } from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authLimiter, refreshLimiter } from "../../middlewares/rateLimit";
import { invitationsService } from "./invitations.service";
import { sendSuccess } from "../../lib/http";

const c = new AuthController();
const router = Router();
router.post("/invitations/accept-existing-password", authLimiter, validate(acceptExistingPasswordInvitationSchema), async (req, res, next) => {
  try { sendSuccess(res, await invitationsService.accept(req.body.token, undefined, undefined, req.body.currentPassword)); }
  catch (error) { next(error); }
});
router.post("/invitations/accept", authLimiter, validate(acceptInvitationSchema), async (req, res, next) => {
  try { sendSuccess(res, await invitationsService.accept(req.body.token, req.body.password)); } catch (error) { next(error); }
});
router.post("/invitations/accept-existing", authLimiter, authenticate, validate(acceptExistingInvitationSchema), async (req, res, next) => {
  try { sendSuccess(res, await invitationsService.accept(req.body.token, undefined, req.auth!.userId)); } catch (error) { next(error); }
});

router.post(
  "/register",
  authLimiter,
  validate(registerSchoolAdminSchema),
  c.register
);
router.post("/login", authLimiter, validate(loginSchema), c.login);

router.post("/refresh", refreshLimiter, validate(refreshSchema), c.refresh);

router.post("/logout", authenticate, c.logout);
router.post("/logout-all", authenticate, c.logoutAll);

router.get("/me", authenticate, c.me);

router.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  c.forgotPassword
);

router.post("/reset-password", authLimiter, validate(resetPasswordSchema), c.resetPassword);

export default router;

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
