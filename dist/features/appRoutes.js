"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const errorHandler_1 = require("../common/middleware/errorHandler");
const notFound_1 = require("../common/middleware/notFound");
const appRouter = express_1.default.Router();
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
const auth_routes_1 = __importDefault(require("./auth/auth.routes"));
const school_routes_1 = __importDefault(require("./schools/school.routes"));
const class_routes_1 = __importDefault(require("./classes/class.routes"));
const student_routes_1 = __importDefault(require("./students/student.routes"));
appRouter.use("/auth", auth_routes_1.default);
appRouter.use("/schools", school_routes_1.default);
appRouter.use("/classes", class_routes_1.default);
appRouter.use("/students", student_routes_1.default);
appRouter.use(notFound_1.notFound);
appRouter.use(errorHandler_1.errorHandler);
exports.default = appRouter;
