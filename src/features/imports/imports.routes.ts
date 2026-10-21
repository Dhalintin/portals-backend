// imports.routes.ts
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  importParentsSchema,
  importStudentsSchema,
} from "./imports.validation";
import { ImportsController } from "./imports.controller";

const c = new ImportsController();
const importsRoutes = Router();

importsRoutes.use(authenticate, requireSchool);

importsRoutes.post(
  "/students",
  requirePermission(PERMISSIONS["students:write"]),
  validate(importStudentsSchema),
  c.students
);

importsRoutes.post(
  "/parents",
  requirePermission(PERMISSIONS["parents:write"]),
  validate(importParentsSchema),
  c.parents
);

export default importsRoutes;
