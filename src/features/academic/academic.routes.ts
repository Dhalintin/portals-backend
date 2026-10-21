import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  createSessionSchema,
  createTermSchema,
  sessionIdParamsSchema,
  termIdParamsSchema,
  updateSessionSchema,
  updateTermSchema,
} from "./academic.validation";
import { AcademicController } from "./academic.controller";

const c = new AcademicController();
const academicRoutes = Router();

academicRoutes.use(authenticate, requireSchool);

academicRoutes.get("/current", c.getCurrent);

academicRoutes.get(
  "/sessions",
  requirePermission(PERMISSIONS["classes:read"]),
  c.listSessions
);

academicRoutes.post(
  "/sessions",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(createSessionSchema),
  c.createSession
);

academicRoutes.patch(
  "/sessions/:sessionId",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(sessionIdParamsSchema, "params"),
  validate(updateSessionSchema),
  c.updateSession
);

academicRoutes.post(
  "/sessions/:sessionId/current",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(sessionIdParamsSchema, "params"),
  c.setCurrentSession
);

academicRoutes.post(
  "/sessions/:sessionId/terms",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(sessionIdParamsSchema, "params"),
  validate(createTermSchema),
  c.createTerm
);

academicRoutes.patch(
  "/sessions/:sessionId/terms/:termId",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(termIdParamsSchema, "params"),
  validate(updateTermSchema),
  c.updateTerm
);

academicRoutes.post(
  "/sessions/:sessionId/terms/:termId/current",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(termIdParamsSchema, "params"),
  c.setCurrentTerm
);

export default academicRoutes;
