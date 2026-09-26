"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const public_schools_controller_1 = require("./public-schools.controller");
const controller = new public_schools_controller_1.PublicSchoolsController();
const publicSchools = (0, express_1.Router)();
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
exports.default = publicSchools;
