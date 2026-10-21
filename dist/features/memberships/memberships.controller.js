"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipsController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const memberships_service_1 = require("./memberships.service");
class MembershipsController {
    list = async (req, res, next) => {
        try {
            const data = await memberships_service_1.membershipsService.list((0, requireSchool_1.getSchoolId)(req), req.query);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
    create = async (req, res, next) => {
        try {
            const data = await memberships_service_1.membershipsService.create((0, requireSchool_1.getSchoolId)(req), { userId: req.auth.userId, orgRole: req.auth.orgRole }, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (e) {
            return next(e);
        }
    };
    update = async (req, res, next) => {
        try {
            const data = await memberships_service_1.membershipsService.update((0, requireSchool_1.getSchoolId)(req), req.params.membershipId, { userId: req.auth.userId, orgRole: req.auth.orgRole }, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, data);
        }
        catch (e) {
            return next(e);
        }
    };
}
exports.MembershipsController = MembershipsController;
