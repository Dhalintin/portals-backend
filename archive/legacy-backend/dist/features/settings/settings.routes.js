"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicSettingsRouter = void 0;
const express_1 = require("express");
const settings_controller_1 = require("./settings.controller");
const settings_dto_1 = require("./settings.dto");
const client_1 = require("@prisma/client");
const validate_1 = require("../../common/middleware/validate");
const authorize_1 = require("../../common/middleware/authorize");
const authenticate_1 = require("../../common/middleware/authenticate");
const adminOnly = [client_1.OrgRole.SCHOOL_ADMIN];
/** Public — no auth. Mount at /api/v1/public */
exports.publicSettingsRouter = (0, express_1.Router)();
/**
 * GET /public/schools/:slug/brand
 * First request on greenspring-lagos.portals.com → personalize UI
 */
exports.publicSettingsRouter.get("/schools/:slug/brand", (0, validate_1.validate)({ params: settings_dto_1.slugParamSchema }), settings_controller_1.settingsController.getPublicBrand);
/** Authenticated — mount at /api/v1/settings */
const settingsRoutes = (0, express_1.Router)();
settingsRoutes.use(authenticate_1.authenticate, authorize_1.requireSchoolContext);
/** GET /settings — full school settings for dashboard */
settingsRoutes.get("/", (0, authorize_1.authorize)(...adminOnly), settings_controller_1.settingsController.getSettings);
/** PATCH /settings/profile */
settingsRoutes.patch("/profile", (0, authorize_1.authorize)(...adminOnly), (0, validate_1.validate)({ body: settings_dto_1.updateProfileBodySchema }), settings_controller_1.settingsController.updateProfile);
/** PATCH /settings/branding */
settingsRoutes.patch("/branding", (0, authorize_1.authorize)(...adminOnly), (0, validate_1.validate)({ body: settings_dto_1.updateBrandingBodySchema }), settings_controller_1.settingsController.updateBranding);
/** PATCH /settings/site — mini website content */
settingsRoutes.patch("/site", (0, authorize_1.authorize)(...adminOnly), (0, validate_1.validate)({ body: settings_dto_1.updateSiteBodySchema }), settings_controller_1.settingsController.updateSite);
/** PATCH /settings/slug — changes subdomain */
settingsRoutes.patch("/slug", (0, authorize_1.authorize)(...adminOnly), (0, validate_1.validate)({ body: settings_dto_1.updateSlugBodySchema }), settings_controller_1.settingsController.updateSlug);
/** POST /settings/onboarding/complete */
settingsRoutes.post("/onboarding/complete", (0, authorize_1.authorize)(...adminOnly), settings_controller_1.settingsController.completeOnboarding);
exports.default = settingsRoutes;
