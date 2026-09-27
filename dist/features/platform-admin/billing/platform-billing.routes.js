"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// platform-billing.routes.ts
const express_1 = require("express");
const platform_billing_controller_1 = require("./platform-billing.controller");
const authorizeGlobal_1 = require("../../../common/middleware/authorizeGlobal");
const authenticate_1 = require("../../../common/middleware/authenticate");
const c = new platform_billing_controller_1.PlatformBillingController();
const billingRoutes = (0, express_1.Router)();
const staff = [
    authenticate_1.authenticate,
    (0, authorizeGlobal_1.authorizeGlobal)(["SUPER_ADMIN", "PLATFORM_ADMIN"]),
];
/** GET  /api/v1/platform/billing/overview */
billingRoutes.get("/overview", ...staff, c.overview);
/** GET  /api/v1/platform/billing/schools?q=&page=&limit= */
billingRoutes.get("/schools", ...staff, c.listSchools);
/** GET  /api/v1/platform/billing/schools/:organizationId/payments */
billingRoutes.get("/schools/:organizationId/payments", ...staff, c.listPayments);
/** POST /api/v1/platform/billing/schools/:organizationId/payments */
billingRoutes.post("/schools/:organizationId/payments", ...staff, c.recordPayment);
exports.default = billingRoutes;
