"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsController = exports.SettingsController = void 0;
const settings_service_1 = require("./settings.service");
const response_1 = require("../../common/http/response");
function actorFromReq(req) {
    const user = req.user;
    const schoolId = req.schoolId ?? user.schoolId;
    if (!user?.sub || !schoolId) {
        throw new Error("Missing auth or school context");
    }
    return {
        userId: user.sub,
        globalRole: user.role,
        orgRole: user.orgRole,
        schoolId,
    };
}
class SettingsController {
    /** Public bootstrap */
    getPublicBrand = async (req, res, next) => {
        try {
            const data = await settings_service_1.settingsService.getPublicBrandBySlug(req.params.slug);
            // Encourage CDN/browser cache of brand assets
            res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getSettings = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.getSettings(actor.schoolId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateProfile = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.updateProfile(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateBranding = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.updateBranding(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateSite = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.updateSite(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    updateSlug = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.updateSlug(actor.schoolId, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    completeOnboarding = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await settings_service_1.settingsService.completeOnboarding(actor.schoolId, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.SettingsController = SettingsController;
exports.settingsController = new SettingsController();
