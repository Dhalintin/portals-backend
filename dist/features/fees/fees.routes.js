"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const fees_controller_1 = require("./fees.controller");
const requireStaff_1 = require("../../middlewares/requireStaff");
const feesRoutes = (0, express_1.Router)();
feesRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
feesRoutes.get("/parent/me", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.parentFees);
feesRoutes.use(requireStaff_1.requireStaff);
// Categories
feesRoutes.post("/categories", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.createCategory);
feesRoutes.get("/categories", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.listCategories);
feesRoutes.patch("/categories/:id", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.updateCategory);
// Structures
feesRoutes.patch("/structures/:id", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.updateStructure);
feesRoutes.post("/structures", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.createStructure);
feesRoutes.get("/structures", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.listStructures);
feesRoutes.get("/structures/:id", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.getStructure);
// Invoices
feesRoutes.patch("/invoices/:id", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.correctInvoice);
feesRoutes.post("/invoices/:id/cancel", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.cancelInvoice);
feesRoutes.post("/invoices/generate", (0, requirePermission_1.requirePermission)("fees:write"), fees_controller_1.feesController.generateInvoices);
feesRoutes.get("/invoices", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.listInvoices);
feesRoutes.get("/invoices/:id", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.getInvoice);
// Payments (manual)
feesRoutes.get("/payments/:id", (0, requirePermission_1.requirePermission)("payments:read"), fees_controller_1.feesController.getPayment);
feesRoutes.post("/payments/:id/reverse", (0, requirePermission_1.requirePermission)("payments:write"), fees_controller_1.feesController.reversePayment);
feesRoutes.post("/payments", (0, requirePermission_1.requirePermission)("payments:write"), fees_controller_1.feesController.createManualPayment);
feesRoutes.post("/payments/:id/allocate", (0, requirePermission_1.requirePermission)("payments:write"), fees_controller_1.feesController.allocatePayment);
// Receipts
feesRoutes.get("/receipts", (0, requirePermission_1.requirePermission)("payments:read"), fees_controller_1.feesController.listReceipts);
feesRoutes.get("/receipts/:id", (0, requirePermission_1.requirePermission)("payments:read"), fees_controller_1.feesController.getReceipt);
// Bursar dashboard snippet
feesRoutes.get("/summary", (0, requirePermission_1.requirePermission)("fees:read"), fees_controller_1.feesController.bursarSummary);
// Authenticated
feesRoutes.post("/payments/initialize", (0, requirePermission_1.requirePermission)("payments:write"), fees_controller_1.feesController.initializeOnline);
feesRoutes.post("/payments/verify/:reference", (0, requirePermission_1.requirePermission)("payments:write"), fees_controller_1.feesController.verifyPayment);
// Public webhook — mount separately with raw body parser
// e.g. in app.ts:
/*
import express from "express";
app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    (req as any).rawBody = req.body;
    // parse JSON for convenience if needed
    try { req.body = JSON.parse(req.body.toString()); } catch {}
    next();
  },
  feesController.webhook
);
*/
exports.default = feesRoutes;
