"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinsController = exports.PinsController = void 0;
const pins_service_1 = require("./pins.service");
const response_1 = require("../../common/http/response"); // adjust
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
class PinsController {
    list = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.list(actor.schoolId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    stats = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.stats(actor.schoolId, req.query);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    getById = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.getById(actor.schoolId, req.params.id);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    generate = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.generate(actor.schoolId, req.body, actor);
            return (0, response_1.sendCreated)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.update(actor.schoolId, req.params.id, req.body, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    disable = async (req, res, next) => {
        try {
            const actor = actorFromReq(req);
            const data = await pins_service_1.pinsService.disable(actor.schoolId, req.params.id, actor);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
    verifyPublic = async (req, res, next) => {
        try {
            const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
                req.socket.remoteAddress;
            const data = await pins_service_1.pinsService.verifyPublic(req.body, ip);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (e) {
            next(e);
        }
    };
}
exports.PinsController = PinsController;
exports.pinsController = new PinsController();
