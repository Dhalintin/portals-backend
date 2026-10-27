import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../lib/http";
import { authService } from "./auth.service";
import type { LoginInput, RegisterSchoolAdminInput } from "./auth.validation";
import { sendEmail } from "../../utils/mailing";

export class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.registerSchoolAdmin(
        req.body as RegisterSchoolAdminInput
      );

      await sendEmail({
        subject: "Registration Successful!",
        receiptent: {
          name: `${data.user.firstName} ${data.user.lastName}`,
          email: data.user.email! as string,
        },
        content: `<p> Welcome, <emp>${data.user.firstName}<emp></p>. <br/><p> ${data?.school?.name} portal has been created</p>`,
      });
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.login(req.body as LoginInput, {
        requestId: req.requestId,
      });

      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.refresh(req.body.refreshToken);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.me(req.auth!.userId, req.auth!.schoolId);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(
        res,
        await authService.logout(req.auth!.userId, req.auth!.sessionId)
      );
    } catch (error) {
      return next(error);
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(res, await authService.logoutAll(req.auth!.userId));
    } catch (error) {
      return next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.forgotPassword(req.body.email);
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await authService.resetPassword(
        req.body.token,
        req.body.password
      );
      return sendSuccess(res, data);
    } catch (e) {
      return next(e);
    }
  };
}

// // src/features/auth/auth.controller.ts
// import type { Request, Response, NextFunction } from "express";
// import { sendSuccess } from "../../common/http/response";
// import { UnauthorizedError } from "../../common/errors/AppError";
// import { authService } from "./auth.service";
// import type {
//   ChangePasswordBody,
//   CreateOrganizationBody,
//   ForgotPasswordBody,
//   GoogleAuthBody,
//   LoginBody,
//   RegisterBody,
//   ResetPasswordBody,
//   SwitchOrganizationBody,
// } from "./auth.dto";
// import type { AppRole, AuthTokenPayload } from "./auth.types";

// export const authController = {
//   async login(req: Request, res: Response, next: NextFunction) {
//     try {
//       const body = req.body as LoginBody;
//       const result = await authService.login(body);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async register(req: Request, res: Response, next: NextFunction) {
//     try {
//       const body = req.body as RegisterBody;
//       const result = await authService.register(body);
//       sendSuccess(res, result, 201);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async googleAuth(req: Request, res: Response, next: NextFunction) {
//     try {
//       const result = await authService.googleAuth(req.body as GoogleAuthBody);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async createOrganization(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await authService.createOrganization(
//         req.user.sub,
//         req.body as CreateOrganizationBody
//       );
//       sendSuccess(res, result, 201);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async switchOrganization(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await authService.switchOrganization(
//         req.user.sub,
//         req.body as SwitchOrganizationBody
//       );
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async me(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();

//       const tokenCtx: AuthTokenPayload = {
//         sub: req.user.sub,
//         email: req.user.email ?? "",
//         role: req.user.role as AppRole,
//         schoolId: req.user.schoolId ?? null,
//         membershipId:
//           (req.user as { membershipId?: string | null }).membershipId ?? null,
//         globalRole: (
//           req.user as { globalRole?: AuthTokenPayload["globalRole"] }
//         ).globalRole,
//       };

//       const user = await authService.me(req.user.sub, tokenCtx);
//       sendSuccess(res, { user });
//     } catch (err) {
//       next(err);
//     }
//   },

//   async logout(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const result = await authService.logout(req.user.sub);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async forgotPassword(req: Request, res: Response, next: NextFunction) {
//     try {
//       const body = req.body as ForgotPasswordBody;
//       const result = await authService.forgotPassword(body);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async resetPassword(req: Request, res: Response, next: NextFunction) {
//     try {
//       const body = req.body as ResetPasswordBody;
//       const result = await authService.resetPassword(body);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },

//   async changePassword(req: Request, res: Response, next: NextFunction) {
//     try {
//       if (!req.user) throw new UnauthorizedError();
//       const body = req.body as ChangePasswordBody;
//       const result = await authService.changePassword(req.user.sub, body);
//       sendSuccess(res, result);
//     } catch (err) {
//       next(err);
//     }
//   },
// };
