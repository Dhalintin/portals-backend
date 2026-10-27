import {financeWorkspace,staffReceiptDocument} from "./financeWorkspace";
import {feesService} from "./fees.service";
import {parentPaymentLimiter} from "../../middlewares/rateLimit";
import {startParentCheckout,parentPaymentStatus,parentReceipt} from "./parentPayments";
import {studentBalances} from './studentBalances';
import {saveFeeAssignment} from './feeAssignments';
import {sendSuccess} from '../../lib/http';
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { requirePermission } from "../../middlewares/requirePermission";
import { feesController } from "./fees.controller";
import { requireStaff } from "../../middlewares/requireStaff";

const feesRoutes = Router();

feesRoutes.use(authenticate, requireSchool);
feesRoutes.get("/parent/me", requirePermission("fees:read"), feesController.parentFees);
feesRoutes.post('/parent/payments', requirePermission('fees:read'), parentPaymentLimiter, async(req,res,next)=>{try{sendSuccess(res,await startParentCheckout(req.auth!,req.body),201);}catch(error){next(error);}});
feesRoutes.post('/parent/payments/:reference/verify', requirePermission('fees:read'), parentPaymentLimiter, async(req,res,next)=>{try{sendSuccess(res,await parentPaymentStatus(req.auth!,req.params.reference as string));}catch(error){next(error);}});
feesRoutes.get('/parent/receipts/:id', requirePermission('fees:read'), async(req,res,next)=>{try{sendSuccess(res,await parentReceipt(req.auth!,req.params.id as string));}catch(error){next(error);}});
feesRoutes.use(requireStaff);
feesRoutes.get('/workspace',requirePermission('payments:read'),async(req,res,next)=>{try{sendSuccess(res,await financeWorkspace(req.auth!.schoolId!,req.query));}catch(error){next(error);}});
feesRoutes.post('/student-payments',requirePermission('payments:write'),async(req,res,next)=>{try{sendSuccess(res,await feesService.recordStudentPayment(req.auth!.schoolId!,req.body,req.auth!.userId),201);}catch(error){next(error);}});
feesRoutes.get('/receipt-documents/:id',requirePermission('payments:read'),async(req,res,next)=>{try{sendSuccess(res,await staffReceiptDocument(req.auth!.schoolId!,req.params.id as string));}catch(error){next(error);}});

feesRoutes.post('/assignments',requirePermission('fees:write'),async(req,res,next)=>{try{sendSuccess(res,await saveFeeAssignment(req.auth!.schoolId!,req.auth!.userId,req.body));}catch(e){next(e);}});
feesRoutes.get('/student-balances',requirePermission('fees:read'),async(req,res,next)=>{try{sendSuccess(res,await studentBalances(req.auth!.schoolId!,req.query));}catch(error){next(error);}});
// Categories
feesRoutes.post(
  "/categories",
  requirePermission("fees:write"),
  feesController.createCategory
);
feesRoutes.get(
  "/categories",
  requirePermission("fees:read"),
  feesController.listCategories
);
feesRoutes.patch(
  "/categories/:id",
  requirePermission("fees:write"),
  feesController.updateCategory
);

// Structures
feesRoutes.patch("/structures/:id", requirePermission("fees:write"), feesController.updateStructure);
feesRoutes.post(
  "/structures",
  requirePermission("fees:write"),
  feesController.createStructure
);
feesRoutes.get(
  "/structures",
  requirePermission("fees:read"),
  feesController.listStructures
);
feesRoutes.get(
  "/structures/:id",
  requirePermission("fees:read"),
  feesController.getStructure
);

// Invoices
feesRoutes.patch("/invoices/:id", requirePermission("fees:write"), feesController.correctInvoice);
feesRoutes.post("/invoices/:id/cancel", requirePermission("fees:write"), feesController.cancelInvoice);
feesRoutes.post(
  "/invoices/generate",
  requirePermission("fees:write"),
  feesController.generateInvoices
);
feesRoutes.get(
  "/invoices",
  requirePermission("fees:read"),
  feesController.listInvoices
);
feesRoutes.get(
  "/invoices/:id",
  requirePermission("fees:read"),
  feesController.getInvoice
);

// Payments (manual)
feesRoutes.get("/payments/:id", requirePermission("payments:read"), feesController.getPayment);
feesRoutes.post("/payments/:id/reverse", requirePermission("payments:write"), feesController.reversePayment);
feesRoutes.post(
  "/payments",
  requirePermission("payments:write"),
  feesController.createManualPayment
);
feesRoutes.post(
  "/payments/:id/allocate",
  requirePermission("payments:write"),
  feesController.allocatePayment
);

// Receipts
feesRoutes.get(
  "/receipts",
  requirePermission("payments:read"),
  feesController.listReceipts
);
feesRoutes.get(
  "/receipts/:id",
  requirePermission("payments:read"),
  feesController.getReceipt
);

// Bursar dashboard snippet
feesRoutes.get(
  "/summary",
  requirePermission("fees:read"),
  feesController.bursarSummary
);

// Authenticated
feesRoutes.post(
  "/payments/initialize",
  requirePermission("payments:write"),
  feesController.initializeOnline
);

feesRoutes.post(
  "/payments/verify/:reference",
  requirePermission("payments:write"),
  feesController.verifyPayment
);

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

export default feesRoutes;
