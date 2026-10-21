// platform-billing.routes.ts
import { Router } from "express";

import { PlatformBillingController } from "./platform-billing.controller";
import { authorizeGlobal } from "../../../common/middleware/authorizeGlobal";
import { authenticate } from "../../../common/middleware/authenticate";

const c = new PlatformBillingController();
const billingRoutes = Router();

const staff = [
  authenticate,
  authorizeGlobal(["SUPER_ADMIN", "PLATFORM_ADMIN"]),
] as const;

/** GET  /api/v1/platform/billing/overview */
billingRoutes.get("/overview", ...staff, c.overview);

/** GET  /api/v1/platform/billing/schools?q=&page=&limit= */
billingRoutes.get("/schools", ...staff, c.listSchools);

/** GET  /api/v1/platform/billing/schools/:organizationId/payments */
billingRoutes.get(
  "/schools/:organizationId/payments",
  ...staff,
  c.listPayments
);

/** POST /api/v1/platform/billing/schools/:organizationId/payments */
billingRoutes.post(
  "/schools/:organizationId/payments",
  ...staff,
  c.recordPayment
);

export default billingRoutes;
