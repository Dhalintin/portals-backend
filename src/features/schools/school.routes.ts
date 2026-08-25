// src/features/schools/school.routes.ts
import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { requireSchoolContext } from "../../common/middleware/authorize"; // or separate file
import { validate } from "../../common/middleware/validate";
import { schoolController } from "./school.controller";
import { updateSchoolBodySchema } from "./school.dto";

const router = Router();

router.use(authenticate, requireSchoolContext);

router.get(
  "/me",
  authorize("school_admin", "teacher", "exam_officer"),
  schoolController.getMe
);

router.patch(
  "/me",
  authorize("school_admin"), // only admins change branding/settings
  validate({ body: updateSchoolBodySchema }),
  schoolController.updateMe
);

export default router;
