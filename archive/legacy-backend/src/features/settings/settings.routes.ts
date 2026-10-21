import { Router } from "express";
import { settingsController } from "./settings.controller";

import {
  slugParamSchema,
  updateBrandingBodySchema,
  updateProfileBodySchema,
  updateSiteBodySchema,
  updateSlugBodySchema,
} from "./settings.dto";
import { OrgRole } from "@prisma/client";
import { validate } from "../../common/middleware/validate";
import {
  authorize,
  requireSchoolContext,
} from "../../common/middleware/authorize";
import { authenticate } from "../../common/middleware/authenticate";

const adminOnly = [OrgRole.SCHOOL_ADMIN];

/** Public — no auth. Mount at /api/v1/public */
export const publicSettingsRouter = Router();

/**
 * GET /public/schools/:slug/brand
 * First request on greenspring-lagos.portals.com → personalize UI
 */
publicSettingsRouter.get(
  "/schools/:slug/brand",
  validate({ params: slugParamSchema }),
  settingsController.getPublicBrand
);

/** Authenticated — mount at /api/v1/settings */
const settingsRoutes = Router();

settingsRoutes.use(authenticate, requireSchoolContext);

/** GET /settings — full school settings for dashboard */
settingsRoutes.get(
  "/",
  authorize(...adminOnly),
  settingsController.getSettings
);

/** PATCH /settings/profile */
settingsRoutes.patch(
  "/profile",
  authorize(...adminOnly),
  validate({ body: updateProfileBodySchema }),
  settingsController.updateProfile
);

/** PATCH /settings/branding */
settingsRoutes.patch(
  "/branding",
  authorize(...adminOnly),
  validate({ body: updateBrandingBodySchema }),
  settingsController.updateBranding
);

/** PATCH /settings/site — mini website content */
settingsRoutes.patch(
  "/site",
  authorize(...adminOnly),
  validate({ body: updateSiteBodySchema }),
  settingsController.updateSite
);

/** PATCH /settings/slug — changes subdomain */
settingsRoutes.patch(
  "/slug",
  authorize(...adminOnly),
  validate({ body: updateSlugBodySchema }),
  settingsController.updateSlug
);

/** POST /settings/onboarding/complete */
settingsRoutes.post(
  "/onboarding/complete",
  authorize(...adminOnly),
  settingsController.completeOnboarding
);

export default settingsRoutes;
