import { Request, Response, NextFunction } from "express";
import { settingsService } from "./settings.service";
import { sendSuccess } from "../../common/http/response";
import type {
  UpdateBrandingBody,
  UpdateProfileBody,
  UpdateSiteBody,
  UpdateSlugBody,
} from "./settings.dto";

function actorFromReq(req: Request) {
  const user = req.user as {
    sub: string;
    role?: string;
    orgRole?: string;
    schoolId?: string;
  };
  const schoolId = (req as any).schoolId ?? user.schoolId;
  if (!user?.sub || !schoolId) {
    throw new Error("Missing auth or school context");
  }
  return {
    userId: user.sub,
    globalRole: user.role,
    orgRole: user.orgRole as any,
    schoolId,
  };
}

export class SettingsController {
  /** Public bootstrap */
  getPublicBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await settingsService.getPublicBrandBySlug(
        req.params.slug as string
      );
      // Encourage CDN/browser cache of brand assets
      res.setHeader(
        "Cache-Control",
        "public, max-age=60, stale-while-revalidate=300"
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.getSettings(actor.schoolId);
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.updateProfile(
        actor.schoolId,
        req.body as UpdateProfileBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateBranding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.updateBranding(
        actor.schoolId,
        req.body as UpdateBrandingBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateSite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.updateSite(
        actor.schoolId,
        req.body as UpdateSiteBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  updateSlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.updateSlug(
        actor.schoolId,
        req.body as UpdateSlugBody,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };

  completeOnboarding = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = actorFromReq(req);
      const data = await settingsService.completeOnboarding(
        actor.schoolId,
        actor
      );
      return sendSuccess(res, data);
    } catch (e) {
      next(e);
    }
  };
}

export const settingsController = new SettingsController();
