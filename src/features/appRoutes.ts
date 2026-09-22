import express, { Request, Response } from "express";
import { errorHandler } from "../common/middleware/errorHandler";
import { notFound } from "../common/middleware/notFound";

// import authRoute from "./auth/auth.route";
// import { OrganizationAuthService } from "./auth/services/authOrg.service";
import { customResponse } from "../utils/customResponse";

const appRouter = express.Router();

appRouter.use("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Service is healthy" });
});

// appRouter.get("/load/:custom", async (req: Request, res: Response) => {
//   try {
//     const customDomain = req.params.custom as string;
//     const config = await OrganizationAuthService.getOrganizationByCustom(
//       customDomain
//     );
//     customResponse({
//       status: 200,
//       res,
//       success: true,
//       message: "Successful",
//       data: config,
//     });
//   } catch (error: any) {
//     return customResponse({
//       status: 500,
//       res,
//       success: false,
//       message: "Failed to fetch data",
//       error: error.message,
//     });
//   }
// });

import authRoutes from "./auth/auth.routes";
import schoolRoutes from "./schools/school.routes";
import classRoutes from "./classes/class.routes";
import studentRoutes from "./students/student.routes";
import teacherRoutes from "./teachers/teacher.routes";
import subjectRoutes from "./subjects/subject.routes";
import resultRoutes, { publicResultsRouter } from "./results/results.routes";
import academicSessionRoutes from "./academic-sessions/academic-sessions.routes";
import pinRoutes, { publicPinsRouter } from "./pins/pins.routes";
import settingsRoutes, {
  publicSettingsRouter,
} from "./settings/settings.routes";

appRouter.use("/auth", authRoutes);

appRouter.use("/schools", schoolRoutes);

appRouter.use("/classes", classRoutes);

appRouter.use("/students", studentRoutes);

appRouter.use("/teachers", teacherRoutes);

appRouter.use("/subjects", subjectRoutes);

appRouter.use("/results", resultRoutes);

appRouter.use("/public/results", publicResultsRouter);

appRouter.use("/academic-sessions", academicSessionRoutes);

appRouter.use("/pins", pinRoutes);

appRouter.use("/public/pins", publicPinsRouter);

appRouter.use("/public", publicSettingsRouter);

appRouter.use("/settings", settingsRoutes);

appRouter.use(notFound);
appRouter.use(errorHandler);

export default appRouter;
