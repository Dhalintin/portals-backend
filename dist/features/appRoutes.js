"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const errorHandler_1 = require("../common/middleware/errorHandler");
const notFound_1 = require("../common/middleware/notFound");
const auth_routes_1 = __importDefault(require("./auth/auth.routes"));
const schools_routes_1 = __importDefault(require("./schools/schools.routes"));
const classes_routes_1 = __importDefault(require("./classes/classes.routes"));
const student_routes_1 = __importDefault(require("./students/student.routes"));
const results_routes_1 = __importDefault(require("./results/results.routes"));
const staff_routes_1 = __importDefault(require("./staff/staff.routes"));
const memberships_routes_1 = __importDefault(require("./memberships/memberships.routes"));
const site_routes_1 = __importDefault(require("./site/site.routes"));
const academic_routes_1 = __importDefault(require("./academic/academic.routes"));
const subscriptions_routes_1 = __importDefault(require("./subscriptions/subscriptions.routes"));
const subjects_routes_1 = __importDefault(require("./subjects/subjects.routes"));
const parents_routes_1 = __importDefault(require("./parents/parents.routes"));
const imports_routes_1 = __importDefault(require("./imports/imports.routes"));
const attendance_routes_1 = __importDefault(require("./attendance/attendance.routes"));
const fees_routes_1 = __importDefault(require("./fees/fees.routes"));
const dashboard_routes_1 = __importDefault(require("./dashboard/dashboard.routes"));
const platform_routes_1 = __importDefault(require("./platform/platform.routes"));
const public_routes_1 = __importDefault(require("./public/public.routes"));
const communication_routes_1 = __importDefault(require("./communication/communication.routes"));
const teacher_routes_1 = __importDefault(require("./teachers/teacher.routes"));
const rateLimit_1 = require("../middlewares/rateLimit");
const readiness_1 = require("../lib/readiness");
const appRouter = express_1.default.Router();
appRouter.get("/health", (_req, res) => res.status(200).json({ status: "ok", message: "Service is healthy" }));
appRouter.get("/health/ready", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        await readiness_1.readiness.checkDatabase();
        res.status(200).json({ status: "ready" });
    }
    catch {
        res.status(503).json({ status: "unavailable" });
    }
});
appRouter.use("/auth", auth_routes_1.default);
appRouter.use("/public", rateLimit_1.publicLimiter, public_routes_1.default);
appRouter.use(rateLimit_1.apiLimiter);
appRouter.use("/memberships", memberships_routes_1.default);
appRouter.use("/schools", schools_routes_1.default);
appRouter.use("/academic", academic_routes_1.default);
appRouter.use("/site", site_routes_1.default);
appRouter.use("/subscription", subscriptions_routes_1.default);
appRouter.use("/classes", classes_routes_1.default);
appRouter.use("/subjects", subjects_routes_1.default);
appRouter.use("/students", student_routes_1.default);
appRouter.use("/parents", parents_routes_1.default);
appRouter.use("/staff", staff_routes_1.default);
appRouter.use("/teachers", teacher_routes_1.default);
appRouter.use("/imports", imports_routes_1.default);
appRouter.use("/attendance", attendance_routes_1.default);
appRouter.use("/results", results_routes_1.default);
appRouter.use("/fees", fees_routes_1.default);
appRouter.use("/dashboard", dashboard_routes_1.default);
appRouter.use("/platform", platform_routes_1.default);
appRouter.use("/communication", communication_routes_1.default);
appRouter.use(notFound_1.notFound);
appRouter.use(errorHandler_1.errorHandler);
exports.default = appRouter;
