// src/features/auth/auth.controller.ts
import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../common/http/response";
import { UnauthorizedError } from "../../common/errors/AppError";
import { authService } from "./auth.service";
import type {
  ChangePasswordBody,
  CreateOrganizationBody,
  ForgotPasswordBody,
  GoogleAuthBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  SwitchOrganizationBody,
} from "./auth.dto";
import type { AppRole, AuthTokenPayload } from "./auth.types";

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as LoginBody;
      const result = await authService.login(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as RegisterBody;
      const result = await authService.register(body);
      // 201 Created
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.googleAuth(req.body as GoogleAuthBody);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await authService.createOrganization(
        req.user.sub,
        req.body as CreateOrganizationBody
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async switchOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await authService.switchOrganization(
        req.user.sub,
        req.body as SwitchOrganizationBody
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();

      const tokenCtx: AuthTokenPayload = {
        sub: req.user.sub,
        email: req.user.email ?? "",
        role: req.user.role as AppRole,
        schoolId: req.user.schoolId ?? null,
        membershipId:
          (req.user as { membershipId?: string | null }).membershipId ?? null,
      };

      const user = await authService.me(req.user.sub, tokenCtx);
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await authService.logout(req.user.sub);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as ForgotPasswordBody;
      const result = await authService.forgotPassword(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as ResetPasswordBody;
      const result = await authService.resetPassword(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const body = req.body as ChangePasswordBody;
      const result = await authService.changePassword(req.user.sub, body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
};
