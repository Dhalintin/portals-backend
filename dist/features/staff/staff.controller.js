"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffController = void 0;
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const staff_service_1 = require("./staff.service");
const memberships_service_1 = require("../memberships/memberships.service");
class StaffController {
    list = async (req, res, next) => {
        try {
            return (0, http_1.sendSuccess)(res, await staff_service_1.staffService.list((0, requireSchool_1.getSchoolId)(req)));
        }
        catch (error) {
            next(error);
        }
    };
    invite = async (req, res, next) => {
        try {
            const invitation = await memberships_service_1.membershipsService.create((0, requireSchool_1.getSchoolId)(req), { userId: req.auth.userId, orgRole: req.auth.orgRole }, req.body, req.requestId);
            return (0, http_1.sendSuccess)(res, invitation, 201);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.StaffController = StaffController;
