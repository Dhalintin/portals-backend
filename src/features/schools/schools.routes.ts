import { Router } from "express";
// import { authenticate } from "../../middleware/authenticate";
// import { requireSchool } from "../../middleware/requireSchool";
// import { requirePermission } from "../../middleware/requirePermission";
// import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../auth/permissions";
import {
  updateSchoolBrandingSchema,
  updateSchoolProfileSchema,
  updateSchoolSlugSchema,
} from "./schools.validation";
import { SchoolsController } from "./schools.controller";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { validate } from "../../middlewares/validate";

const c = new SchoolsController();
const schoolsRoutes = Router();

schoolsRoutes.use(authenticate, requireSchool);

schoolsRoutes.get("/", c.get);
schoolsRoutes.get("/onboarding", requirePermission(PERMISSIONS["settings:write"]), c.onboarding);

schoolsRoutes.patch(
  "/profile",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(updateSchoolProfileSchema),
  c.updateProfile
);

schoolsRoutes.patch(
  "/branding",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(updateSchoolBrandingSchema),
  c.updateBranding
);

schoolsRoutes.patch(
  "/slug",
  requirePermission(PERMISSIONS["settings:write"]),
  validate(updateSchoolSlugSchema),
  c.updateSlug
);

schoolsRoutes.post(
  "/onboarding/complete",
  requirePermission(PERMISSIONS["settings:write"]),
  c.completeOnboarding
);

export default schoolsRoutes;

// // src/features/schools/school.routes.ts
// import { Router } from "express";
// import { authenticate } from "../../common/middleware/authenticate";
// import { authorize } from "../../common/middleware/authorize";
// import { requireSchoolContext } from "../../common/middleware/authorize"; // or separate file
// import { validate } from "../../common/middleware/validate";
// import { schoolController } from "./schools.controller";
// import { updateSchoolBodySchema } from "./school.dto";

// const router = Router();

// router.use(authenticate, requireSchoolContext);

// router.get(
//   "/me",
//   authorize("SCHOOL_ADMIN", "TEACHER", "EXAM_OFFICER"),
//   schoolController.getMe
// );

// router.patch(
//   "/me",
//   authorize("SCHOOL_ADMIN"), // only admins change branding/settings
//   validate({ body: updateSchoolBodySchema }),
//   schoolController.updateMe
// );

// export default router;
