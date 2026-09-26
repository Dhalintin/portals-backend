"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const platform_admin_controller_1 = require("./platform-admin.controller");
const platform_admin_dto_1 = require("./platform-admin.dto");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const authenticate_1 = require("../../common/middleware/authenticate");
const authorizeGlobal_1 = require("../../common/middleware/authorizeGlobal");
const validate_1 = require("../../common/middleware/validate");
const platformAdminRoutes = (0, express_1.Router)();
const platformStaff = [client_1.GlobalRole.SUPER_ADMIN, client_1.GlobalRole.PLATFORM_ADMIN];
const superOnly = [client_1.GlobalRole.SUPER_ADMIN];
platformAdminRoutes.use(authenticate_1.authenticate);
/** GET /platform/overview */
platformAdminRoutes.get("/overview", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), platform_admin_controller_1.platformAdminController.overview);
/** GET /platform/schools */
platformAdminRoutes.get("/schools", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), (0, validate_1.validate)({ query: platform_admin_dto_1.listSchoolsQuerySchema }), platform_admin_controller_1.platformAdminController.listSchools);
/** GET /platform/schools/:organizationId */
platformAdminRoutes.get("/schools/:organizationId", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), (0, validate_1.validate)({ params: platform_admin_dto_1.orgIdParamSchema }), platform_admin_controller_1.platformAdminController.getSchool);
/** PATCH /platform/schools/:organizationId/active — SUPER only */
platformAdminRoutes.patch("/schools/:organizationId/active", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({
    params: platform_admin_dto_1.orgIdParamSchema,
    body: zod_1.z.object({ isActive: zod_1.z.boolean() }),
}), platform_admin_controller_1.platformAdminController.setSchoolActive);
/** PIN inventory & print */
platformAdminRoutes.get("/schools/:organizationId/pins/stats", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), (0, validate_1.validate)({ params: platform_admin_dto_1.orgIdParamSchema }), platform_admin_controller_1.platformAdminController.pinStats);
platformAdminRoutes.get("/schools/:organizationId/pins", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), (0, validate_1.validate)({
    params: platform_admin_dto_1.orgIdParamSchema,
    query: platform_admin_dto_1.listPinsForSchoolQuerySchema,
}), platform_admin_controller_1.platformAdminController.listPins);
/** POST — generates batch; returns full codes for Portals printing */
platformAdminRoutes.post("/schools/:organizationId/pins/generate", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), (0, validate_1.validate)({
    params: platform_admin_dto_1.orgIdParamSchema,
    body: platform_admin_dto_1.generatePinsForSchoolBodySchema,
}), platform_admin_controller_1.platformAdminController.generatePins);
/** Support: term publish snapshot */
platformAdminRoutes.get("/schools/:organizationId/terms/:termId/publish-state", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), platform_admin_controller_1.platformAdminController.termPublishState);
platformAdminRoutes.use("/schools/:organizationId/pins/mark-printed", (0, authorizeGlobal_1.authorizeGlobal)(platformStaff), platform_admin_controller_1.platformAdminController.markPrinted);
/** ── SUPER_ADMIN: manage platform admins ── */
platformAdminRoutes.get("/admins", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({ query: platform_admin_dto_1.listPlatformAdminsQuerySchema }), platform_admin_controller_1.platformAdminController.listPlatformAdmins);
platformAdminRoutes.post("/admins", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({ body: platform_admin_dto_1.createPlatformAdminBodySchema }), platform_admin_controller_1.platformAdminController.createPlatformAdmin);
platformAdminRoutes.post("/admins/assign-schools", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({ body: platform_admin_dto_1.assignSchoolsBodySchema }), platform_admin_controller_1.platformAdminController.assignSchools);
platformAdminRoutes.post("/admins/unassign-school", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({ body: platform_admin_dto_1.unassignSchoolBodySchema }), platform_admin_controller_1.platformAdminController.unassignSchool);
platformAdminRoutes.patch("/admins/:userId/active", (0, authorizeGlobal_1.authorizeGlobal)(superOnly), (0, validate_1.validate)({
    params: zod_1.z.object({ userId: zod_1.z.string().uuid() }),
    body: zod_1.z.object({ isActive: zod_1.z.boolean() }),
}), platform_admin_controller_1.platformAdminController.setPlatformAdminActive);
exports.default = platformAdminRoutes;
