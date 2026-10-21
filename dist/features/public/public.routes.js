"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const public_controller_1 = require("./public.controller");
// No authenticate middleware on purpose
const publicRoutes = (0, express_1.Router)();
// Public brand + full site content
publicRoutes.get("/schools/:slug", public_controller_1.publicController.getBrand);
// Lightweight status (colors, feature flags)
publicRoutes.get("/schools/:slug/status", public_controller_1.publicController.getSiteStatus);
// Optional public directory
publicRoutes.get("/directory", public_controller_1.publicController.listSchools);
exports.default = publicRoutes;
