import { requireStaffManager } from "../../middlewares/requireStaffManager";
import { Router } from "express";
import { PERMISSIONS } from "../../auth/permissions";
import {
  createMembershipSchema,
  listMembershipsQuerySchema,
  updateMembershipSchema,
  membershipIdParamsSchema,
} from "./memberships.validation";
import { MembershipsController } from "./memberships.controller";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { invitationLimiter } from "../../middlewares/rateLimit";
import { invitationsService } from "../auth/invitations.service";
import { sendSuccess } from "../../lib/http";
import { z } from "zod";

const c = new MembershipsController();
const membershipRoutes = Router();

membershipRoutes.use(authenticate, requireSchool, requireStaffManager);
membershipRoutes.get("/invitations", requirePermission("memberships:write"), async (req, res, next) => {
  try {
    const { prisma } = await import("../../lib/prisma");
    sendSuccess(res, await prisma.schoolInvitation.findMany({ where: { organizationId: req.auth!.schoolId! }, take: 100,
      orderBy: { createdAt: "desc" }, select: { id: true, email: true, firstName: true, lastName: true, role: true, parentId: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } }));
  } catch (error) { next(error); }
});
membershipRoutes.post("/invitations/:id/revoke", requirePermission("memberships:write"), validate(z.object({ id: z.string().uuid() }), "params"), async (req, res, next) => {
  try { sendSuccess(res, await invitationsService.revoke(req.auth!.schoolId!, req.params.id as string, req.auth!.userId)); }
  catch (error) { next(error); }
});

membershipRoutes.get(
  "/",
  requirePermission(PERMISSIONS["memberships:read"]),
  validate(listMembershipsQuerySchema, "query"),
  c.list
);

membershipRoutes.post(
  "/",
  requirePermission(PERMISSIONS["memberships:write"]),
  validate(createMembershipSchema),
  invitationLimiter,
  c.create
);

membershipRoutes.patch(
  "/:membershipId",
  requirePermission(PERMISSIONS["memberships:write"]),
  validate(membershipIdParamsSchema, "params"),
  validate(updateMembershipSchema),
  c.update
);

export default membershipRoutes;
