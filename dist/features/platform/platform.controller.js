"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformController = exports.PlatformController = void 0;
const platform_service_1 = require("./platform.service");
const platform_validation_1 = require("./platform.validation");
const http_1 = require("../../lib/http");
class PlatformController {
    listSchools = async (req, res, next) => {
        try {
            const query = platform_validation_1.listSchoolsQuerySchema.parse(req.query);
            const data = await platform_service_1.platformService.listSchools(query);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getSchool = async (req, res, next) => {
        try {
            const data = await platform_service_1.platformService.getSchool(req.params.id);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    setSchoolStatus = async (req, res, next) => {
        try {
            const input = platform_validation_1.updateSchoolStatusSchema.parse(req.body);
            const data = await platform_service_1.platformService.setSchoolActive(req.params.id, input.isActive, req.auth.userId, input.reason, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    updateSubscription = async (req, res, next) => {
        try {
            const input = platform_validation_1.updateSubscriptionSchema.parse(req.body);
            const data = await platform_service_1.platformService.updateSubscription(req.params.id, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    assignAdmin = async (req, res, next) => {
        try {
            const input = platform_validation_1.assignPlatformAdminSchema.parse(req.body);
            const data = await platform_service_1.platformService.assignPlatformAdmin(input, req.auth.userId);
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    removeAdmin = async (req, res, next) => {
        try {
            const { userId, organizationId } = req.params;
            const data = await platform_service_1.platformService.removePlatformAdmin(userId, organizationId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    listAdmins = async (req, res, next) => {
        try {
            const organizationId = typeof req.query.organizationId === "string"
                ? req.query.organizationId
                : undefined;
            const data = await platform_service_1.platformService.listPlatformAdmins(organizationId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    createPlatformUser = async (req, res, next) => {
        try {
            const input = platform_validation_1.createPlatformUserSchema.parse(req.body);
            const data = await platform_service_1.platformService.createPlatformUser(input);
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    metrics = async (req, res, next) => {
        try {
            const data = await platform_service_1.platformService.platformMetrics();
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.PlatformController = PlatformController;
exports.platformController = new PlatformController();
