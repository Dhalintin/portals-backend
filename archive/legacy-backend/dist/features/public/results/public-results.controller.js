"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicResultsController = void 0;
const public_results_service_1 = require("./public-results.service");
const dto_1 = require("../dto");
const response_1 = require("../../../common/http/response");
const service = new public_results_service_1.PublicResultsService();
function clientIp(req) {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length)
        return xf.split(",")[0]?.trim();
    return req.socket?.remoteAddress ?? undefined;
}
class PublicResultsController {
    verify = async (req, res, next) => {
        try {
            const body = dto_1.verifyResultSchema.parse(req.body);
            const data = await service.verify(body, { ip: clientIp(req) });
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (err) {
            return next(err);
        }
    };
}
exports.PublicResultsController = PublicResultsController;
