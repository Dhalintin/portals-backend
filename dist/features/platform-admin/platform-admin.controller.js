"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformAdminController = exports.PlatformAdminController = void 0;
const platform_admin_service_1 = require("./platform-admin.service");
const response_1 = require("../../common/http/response");
const platform_admin_dto_1 = require("./platform-admin.dto");
function actorFromReq(req) {
    const user = req.user;
    const globalRole = (user.globalRole ?? user.role);
    if (!user?.sub)
        throw new Error("Unauthorized");
    return { userId: user.sub, globalRole };
}
class PlatformAdminController {
    overview = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.getMyOverview(actorFromReq(req));
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    listSchools = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.listSchools(actorFromReq(req), req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getSchool = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.getSchoolDetail(actorFromReq(req), req.params.organizationId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    setSchoolActive = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.setSchoolActive(actorFromReq(req), req.params.organizationId, Boolean(req.body.isActive));
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    generatePins = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.generatePinsForSchool(actorFromReq(req), req.params.organizationId, req.body);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    listPins = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.listPinsForSchool(actorFromReq(req), req.params.organizationId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    markPrinted = async (req, res, next) => {
        try {
            const { organizationId } = platform_admin_dto_1.markPinsPrintedParamsSchema.parse(req.params);
            const body = platform_admin_dto_1.markPinsPrintedSchema.parse(req.body);
            const data = await platform_admin_service_1.platformAdminService.markPrinted(organizationId, body);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (err) {
            return next(err);
        }
    };
    pinStats = async (req, res, next) => {
        try {
            const termId = req.query.termId;
            const data = await platform_admin_service_1.platformAdminService.getPinStatsForSchool(actorFromReq(req), req.params.organizationId, termId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    termPublishState = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.getTermPublishState(actorFromReq(req), req.params.organizationId, req.params.termId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    // Super admin only
    createPlatformAdmin = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.createPlatformAdmin(actorFromReq(req), req.body);
            return (0, response_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            next(e);
        }
    };
    listPlatformAdmins = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.listPlatformAdmins(actorFromReq(req), req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    assignSchools = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.assignSchools(actorFromReq(req), req.body);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    unassignSchool = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.unassignSchool(actorFromReq(req), req.body.userId, req.body.organizationId);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    setPlatformAdminActive = async (req, res, next) => {
        try {
            const data = await platform_admin_service_1.platformAdminService.setPlatformAdminActive(actorFromReq(req), req.params.userId, Boolean(req.body.isActive));
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.PlatformAdminController = PlatformAdminController;
exports.platformAdminController = new PlatformAdminController();
