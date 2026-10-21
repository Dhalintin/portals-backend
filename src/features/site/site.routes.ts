import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";
import { PERMISSIONS } from "../../auth/permissions";
import { updateSiteSchema } from "./site.validation";
import { SiteController } from "./site.controller";

const c = new SiteController();
const siteRoutes = Router();

siteRoutes.use(authenticate, requireSchool);

siteRoutes.get("/", c.get);
siteRoutes.patch(
  "/",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(updateSiteSchema),
  c.update
);

export default siteRoutes;
