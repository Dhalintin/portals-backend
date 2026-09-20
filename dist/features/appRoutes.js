"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const teacher_routes_1 = __importDefault(require("./teachers/teacher.routes"));
const subject_routes_1 = __importDefault(require("./subjects/subject.routes"));
const results_routes_1 = __importStar(require("./results/results.routes"));
const academic_sessions_routes_1 = __importDefault(require("./academic-sessions/academic-sessions.routes"));
const pins_routes_1 = __importStar(require("./pins/pins.routes"));
appRouter.use("/auth", auth_routes_1.default);
appRouter.use("/schools", school_routes_1.default);
appRouter.use("/classes", class_routes_1.default);
appRouter.use("/students", student_routes_1.default);
appRouter.use("/teachers", teacher_routes_1.default);
appRouter.use("/subjects", subject_routes_1.default);
appRouter.use("/results", results_routes_1.default);
appRouter.use("/public/results", results_routes_1.publicResultsRouter);
appRouter.use("/academic-sessions", academic_sessions_routes_1.default);
appRouter.use("/pins", pins_routes_1.default);
appRouter.use("/public/pins", pins_routes_1.publicPinsRouter);
appRouter.use(notFound_1.notFound);
appRouter.use(errorHandler_1.errorHandler);
exports.default = appRouter;
