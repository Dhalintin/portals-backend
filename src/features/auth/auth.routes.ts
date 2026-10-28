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
import { completeInvitationSchema, googleInvitationSchema, googleLoginSchema } from "./auth.validation";
import { googleLogin, verifiedGoogleProfile } from "./googleAuth";
import { authSessions } from "./auth.sessions";
import rateLimit from "express-rate-limit";
import { ownProfile, updateOwnProfile, changeOwnPassword } from "./profile.service";

const c = new AuthController();
const router = Router();
router.get("/google/config", (_req, res) => sendSuccess(res, { clientId: process.env.GOOGLE_CLIENT_ID || null }));
router.post("/google", authLimiter, validate(googleLoginSchema), async (req, res, next) => {
  try { sendSuccess(res, await googleLogin(req.body.idToken, req.body.nonce, req.body.schoolSlug)); } catch (error) { next(error); }
});
router.post("/invitations/complete", authLimiter, validate(completeInvitationSchema), async (req, res, next) => {
  try {
    const result = await invitationsService.accept(req.body.token, req.body.password, undefined, req.body.currentPassword,
      req.body.firstName && req.body.lastName ? { firstName: req.body.firstName, lastName: req.body.lastName } : undefined);
    sendSuccess(res, await authSessions.create(result.userId, result.schoolId, result.authVersion));
  } catch (error) { next(error); }
});
router.post("/invitations/accept-google", authLimiter, validate(googleInvitationSchema), async (req, res, next) => {
  try {
    const google = await verifiedGoogleProfile(req.body.idToken, req.body.nonce);
    const result = await invitationsService.accept(req.body.token, undefined, undefined, undefined,
      { firstName: google.firstName, lastName: google.lastName, google });
    sendSuccess(res, await authSessions.create(result.userId, result.schoolId, result.authVersion));
  } catch (error) { next(error); }
});
router.post("/invitations/inspect", authLimiter, validate(acceptExistingInvitationSchema), async (req, res, next) => {
  try { sendSuccess(res, await invitationsService.inspect(req.body.token)); } catch (error) { next(error); }
});
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
router.get("/profile", authenticate, async (req, res, next) => {
  try { sendSuccess(res, await ownProfile(req.auth!)); } catch (error) { next(error); }
});
router.patch("/profile", authenticate, async (req, res, next) => {
  try { sendSuccess(res, await updateOwnProfile(req.auth!, req.body)); } catch (error) { next(error); }
});
const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: req => req.auth!.userId,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many password attempts. Try again later." } } });
router.post("/change-password", authenticate, accountLimit, async (req, res, next) => {
  try { sendSuccess(res, await changeOwnPassword(req.auth!, req.body)); } catch (error) { next(error); }
});

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
