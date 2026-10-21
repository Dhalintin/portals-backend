import { Router } from "express";
import { publicController } from "./public.controller";
// No authenticate middleware on purpose

const publicRoutes = Router();

// Public brand + full site content
publicRoutes.get("/schools/:slug", publicController.getBrand);

// Lightweight status (colors, feature flags)
publicRoutes.get("/schools/:slug/status", publicController.getSiteStatus);

// Optional public directory
publicRoutes.get("/directory", publicController.listSchools);

export default publicRoutes;
