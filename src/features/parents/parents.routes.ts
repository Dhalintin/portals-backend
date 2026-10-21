import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { invitationLimiter } from "../../middlewares/rateLimit";
import { PERMISSIONS } from "../../auth/permissions";
import {
  createParentSchema,
  inviteParentUserSchema,
  linkStudentParamsSchema,
  linkStudentSchema,
  listParentsQuerySchema,
  parentIdParamsSchema,
  updateParentSchema,
} from "./parents.validation";
import { ParentsController } from "./parents.controller";

const c = new ParentsController();
const parentsRoutes = Router();

parentsRoutes.use(authenticate, requireSchool);
parentsRoutes.get("/me", c.me);

parentsRoutes.get(
  "/",
  requirePermission(PERMISSIONS["parents:read"]),
  validate(listParentsQuerySchema, "query"),
  c.list
);

parentsRoutes.post(
  "/",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(createParentSchema),
  c.create
);

parentsRoutes.get(
  "/:parentId",
  requirePermission(PERMISSIONS["parents:read"]),
  validate(parentIdParamsSchema, "params"),
  c.get
);

parentsRoutes.patch(
  "/:parentId",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(parentIdParamsSchema, "params"),
  validate(updateParentSchema),
  c.update
);

parentsRoutes.post(
  "/:parentId/students",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(parentIdParamsSchema, "params"),
  validate(linkStudentSchema),
  c.linkStudent
);

parentsRoutes.delete(
  "/:parentId/students/:studentId",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(linkStudentParamsSchema, "params"),
  c.unlinkStudent
);

parentsRoutes.post(
  "/:parentId/invite",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(parentIdParamsSchema, "params"),
  validate(inviteParentUserSchema),
  invitationLimiter,
  c.inviteUser
);

export default parentsRoutes;
