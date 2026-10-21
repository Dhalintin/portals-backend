import { Router } from "express";
import { PublicSchoolsController } from "./public-schools.controller";

const controller = new PublicSchoolsController();
const publicSchools = Router();

/**
 * GET /api/v1/public/schools?q=&page=&limit=
 * No auth. Active + onboarded schools only. Public fields only.
 */
publicSchools.get("/", controller.list);

/**
 * GET /api/v1/public/schools/:slug
 * Lightweight public card (optional; brand stays at /public/schools/:slug/brand).
 */
publicSchools.get("/:slug", controller.getBySlug);

export default publicSchools;
