"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const subscriptions_service_1 = require("./subscriptions.service");
class SubscriptionsController {
    get = async (req, res, next) => {
        try {
            const data = await subscriptions_service_1.subscriptionsService.get((0, requireSchool_1.getSchoolId)(req));
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.SubscriptionsController = SubscriptionsController;
