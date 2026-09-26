import { Router } from "express";
import { PublicResultsController } from "./public-results.controller";
import publicSchools from "../schools/public-schools.routes";
// Optional: rateLimit middleware if you already have one
// import { publicResultRateLimit } from "@/middleware/rateLimit";

const controller = new PublicResultsController();
const publicResultRoutes = Router();

/**
 * POST /api/v1/public/results/verify
 * Body: { organizationSlug, admissionNumber, serial, code }
 * No auth.
 */
publicResultRoutes.post(
  "/result/verify",
  // publicResultRateLimit,
  controller.verify
);

publicResultRoutes.use(
  "/schools",
  // publicResultRateLimit,
  publicSchools
);

export default publicResultRoutes;
