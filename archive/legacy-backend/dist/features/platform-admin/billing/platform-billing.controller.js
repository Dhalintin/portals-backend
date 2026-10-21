"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformBillingController = void 0;
const platform_billing_service_1 = require("./platform-billing.service");
const dto_1 = require("./dto");
const response_1 = require("../../../common/http/response");
const service = new platform_billing_service_1.PlatformBillingService();
class PlatformBillingController {
    overview = async (_req, res, next) => {
        try {
            return (0, response_1.sendSuccess)(res, await service.overview());
        }
        catch (e) {
            return next(e);
        }
    };
    listSchools = async (req, res, next) => {
        try {
            const query = dto_1.listBillingQuerySchema.parse(req.query);
            return (0, response_1.sendSuccess)(res, await service.listSchools(query));
        }
        catch (e) {
            return next(e);
        }
    };
    recordPayment = async (req, res, next) => {
        try {
            const { organizationId } = dto_1.organizationIdParamSchema.parse(req.params);
            const body = dto_1.recordPaymentSchema.parse(req.body);
            const userId = req.user?.sub;
            const data = await service.recordPayment(organizationId, body, userId);
            return (0, response_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    listPayments = async (req, res, next) => {
        try {
            const { organizationId } = dto_1.organizationIdParamSchema.parse(req.params);
            return (0, response_1.sendSuccess)(res, await service.listPayments(organizationId));
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.PlatformBillingController = PlatformBillingController;
