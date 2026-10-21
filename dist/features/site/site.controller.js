"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteController = void 0;
const http_1 = require("../../lib/http");
const site_service_1 = require("./site.service");
const requireSchool_1 = require("../../middlewares/requireSchool");
class SiteController {
    get = async (req, res, next) => {
        try {
            const data = await site_service_1.siteService.get((0, requireSchool_1.getSchoolId)(req));
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await site_service_1.siteService.update((0, requireSchool_1.getSchoolId)(req), req.auth.userId, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.SiteController = SiteController;
