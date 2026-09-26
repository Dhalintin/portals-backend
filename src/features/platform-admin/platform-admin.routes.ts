import { Router } from "express";
import { platformAdminController } from "./platform-admin.controller";
import {
  assignSchoolsBodySchema,
  createPlatformAdminBodySchema,
  generatePinsForSchoolBodySchema,
  listPinsForSchoolQuerySchema,
  listPlatformAdminsQuerySchema,
  listSchoolsQuerySchema,
  orgIdParamSchema,
  unassignSchoolBodySchema,
} from "./platform-admin.dto";
import { GlobalRole } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../common/middleware/authenticate";
import { authorizeGlobal } from "../../common/middleware/authorizeGlobal";
import { validate } from "../../common/middleware/validate";

const platformAdminRoutes = Router();

const platformStaff = [GlobalRole.SUPER_ADMIN, GlobalRole.PLATFORM_ADMIN];
const superOnly = [GlobalRole.SUPER_ADMIN];

platformAdminRoutes.use(authenticate);

/** GET /platform/overview */
platformAdminRoutes.get(
  "/overview",
  authorizeGlobal(platformStaff),
  platformAdminController.overview
);

/** GET /platform/schools */
platformAdminRoutes.get(
  "/schools",
  authorizeGlobal(platformStaff),
  validate({ query: listSchoolsQuerySchema }),
  platformAdminController.listSchools
);

/** GET /platform/schools/:organizationId */
platformAdminRoutes.get(
  "/schools/:organizationId",
  authorizeGlobal(platformStaff),
  validate({ params: orgIdParamSchema }),
  platformAdminController.getSchool
);

/** PATCH /platform/schools/:organizationId/active — SUPER only */
platformAdminRoutes.patch(
  "/schools/:organizationId/active",
  authorizeGlobal(superOnly),
  validate({
    params: orgIdParamSchema,
    body: z.object({ isActive: z.boolean() }),
  }),
  platformAdminController.setSchoolActive
);

/** PIN inventory & print */
platformAdminRoutes.get(
  "/schools/:organizationId/pins/stats",
  authorizeGlobal(platformStaff),
  validate({ params: orgIdParamSchema }),
  platformAdminController.pinStats
);

platformAdminRoutes.get(
  "/schools/:organizationId/pins",
  authorizeGlobal(platformStaff),
  validate({
    params: orgIdParamSchema,
    query: listPinsForSchoolQuerySchema,
  }),
  platformAdminController.listPins
);

/** POST — generates batch; returns full codes for Portals printing */
platformAdminRoutes.post(
  "/schools/:organizationId/pins/generate",
  authorizeGlobal(platformStaff),
  validate({
    params: orgIdParamSchema,
    body: generatePinsForSchoolBodySchema,
  }),
  platformAdminController.generatePins
);

/** Support: term publish snapshot */
platformAdminRoutes.get(
  "/schools/:organizationId/terms/:termId/publish-state",
  authorizeGlobal(platformStaff),
  platformAdminController.termPublishState
);

platformAdminRoutes.use(
  "/schools/:organizationId/pins/mark-printed",
  authorizeGlobal(platformStaff),
  platformAdminController.markPrinted
);

/** ── SUPER_ADMIN: manage platform admins ── */
platformAdminRoutes.get(
  "/admins",
  authorizeGlobal(superOnly),
  validate({ query: listPlatformAdminsQuerySchema }),
  platformAdminController.listPlatformAdmins
);

platformAdminRoutes.post(
  "/admins",
  authorizeGlobal(superOnly),
  validate({ body: createPlatformAdminBodySchema }),
  platformAdminController.createPlatformAdmin
);

platformAdminRoutes.post(
  "/admins/assign-schools",
  authorizeGlobal(superOnly),
  validate({ body: assignSchoolsBodySchema }),
  platformAdminController.assignSchools
);

platformAdminRoutes.post(
  "/admins/unassign-school",
  authorizeGlobal(superOnly),
  validate({ body: unassignSchoolBodySchema }),
  platformAdminController.unassignSchool
);

platformAdminRoutes.patch(
  "/admins/:userId/active",
  authorizeGlobal(superOnly),
  validate({
    params: z.object({ userId: z.string().uuid() }),
    body: z.object({ isActive: z.boolean() }),
  }),
  platformAdminController.setPlatformAdminActive
);

export default platformAdminRoutes;
