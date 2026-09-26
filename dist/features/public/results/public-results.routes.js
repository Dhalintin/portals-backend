"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const public_results_controller_1 = require("./public-results.controller");
const public_schools_routes_1 = __importDefault(require("../schools/public-schools.routes"));
// Optional: rateLimit middleware if you already have one
// import { publicResultRateLimit } from "@/middleware/rateLimit";
const controller = new public_results_controller_1.PublicResultsController();
const publicResultRoutes = (0, express_1.Router)();
/**
 * POST /api/v1/public/results/verify
 * Body: { organizationSlug, admissionNumber, serial, code }
 * No auth.
 */
publicResultRoutes.post("/result/verify", 
// publicResultRateLimit,
controller.verify);
publicResultRoutes.use("/schools", 
// publicResultRateLimit,
public_schools_routes_1.default);
exports.default = publicResultRoutes;
