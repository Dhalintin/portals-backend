import type { Request, Response, NextFunction } from "express";
// import { feesService } from "./fees.service";
import {
  createFeeCategorySchema,
  updateFeeCategorySchema,
  createFeeStructureSchema,
  updateFeeStructureSchema,
  cancelInvoiceSchema,
  generateInvoicesSchema,
  listInvoicesQuerySchema,
  createManualPaymentSchema,
  correctInvoiceSchema,
  reversePaymentSchema,
  allocatePaymentSchema,
  initializePaymentSchema,
} from "./fees.validation";
import { sendSuccess } from "../../lib/http";
import { feesService } from "./fees.service";
import { AppError } from "../../lib/errors";

export class FeesController {
  correctInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await feesService.correctInvoice(req.auth!.schoolId!, req.params.id as string,
      correctInvoiceSchema.parse(req.body), req.auth!.userId, req.requestId)); } catch (error) { next(error); }
  };
  reversePayment = async (req: Request, res: Response, next: NextFunction) => {
    try { const { reason } = reversePaymentSchema.parse(req.body);
      sendSuccess(res, await feesService.reverseManualPayment(req.auth!.schoolId!, req.params.id as string,
        reason, req.auth!.userId, req.requestId)); } catch (error) { next(error); }
  };
  getPayment = async (req: Request, res: Response, next: NextFunction) => {
    try { sendSuccess(res, await feesService.getPayment(req.auth!.schoolId!, req.params.id as string)); }
    catch (error) { next(error); }
  };
  // Categories
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createFeeCategorySchema.parse(req.body);
      const data = await feesService.createCategory(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  listCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.listCategories(req.auth!.schoolId!);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateFeeCategorySchema.parse(req.body);
      const data = await feesService.updateCategory(
        req.auth!.schoolId!,
        req.params.id as string,
        input
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // Structures
  updateStructure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.updateStructure(req.auth!.schoolId!, req.params.id as string,
        updateFeeStructureSchema.parse(req.body), req.auth!.userId, req.requestId);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  cancelInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = cancelInvoiceSchema.parse(req.body);
      const data = await feesService.cancelInvoice(req.auth!.schoolId!, req.params.id as string,
        reason, req.auth!.userId, req.requestId);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };
  createStructure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createFeeStructureSchema.parse(req.body);
      const data = await feesService.createStructure(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  listStructures = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.listStructures(req.auth!.schoolId!);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getStructure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.getStructure(
        req.auth!.schoolId!,
        req.params.id as string
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // Invoices
  generateInvoices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = generateInvoicesSchema.parse(req.body);
      const data = await feesService.generateInvoices(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, data.replayed ? 200 : 201);
    } catch (err) {
      next(err);
    }
  };

  listInvoices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listInvoicesQuerySchema.parse(req.query);
      const data = await feesService.listInvoices(req.auth!.schoolId!, query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.getInvoice(
        req.auth!.schoolId!,
        req.params.id as string
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // Payments
  createManualPayment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = createManualPaymentSchema.parse(req.body);
      const data = await feesService.createManualPayment(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, data.replayed ? 200 : 201);
    } catch (err) {
      next(err);
    }
  };

  allocatePayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = allocatePaymentSchema.parse(req.body);
      const data = await feesService.allocatePayment(
        req.auth!.schoolId!,
        req.params.id as string,
        input.allocations,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // Receipts
  getReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.getReceipt(
        req.auth!.schoolId!,
        req.params.id as string
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listReceipts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId =
        typeof req.query.paymentId === "string"
          ? req.query.paymentId
          : undefined;
      const data = await feesService.listReceipts(
        req.auth!.schoolId!,
        paymentId
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // Parent + Bursar
  parentFees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await feesService.parentFees(
        req.auth!.schoolId!,
        req.auth!.userId
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  bursarSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from =
        typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const termId = listInvoicesQuerySchema.pick({ termId: true }).parse(req.query).termId;
      const data = await feesService.bursarSummary(req.auth!.schoolId!, {
        from,
        to,
        termId,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  initializeOnline = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const input = initializePaymentSchema.parse(req.body);
      const data = await feesService.initializeOnlinePayment(
        req.auth!.schoolId!,
        input,
        req.auth!.userId,
        { requestId: req.requestId }
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  // Webhook must receive raw body for signature verification
  webhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers["x-paystack-signature"] as
        | string
        | undefined;
      // req.rawBody must be set by a raw-body middleware on this route only
      const rawBody = (req as any).rawBody;
      if (!Buffer.isBuffer(rawBody)) {
        throw new AppError(400, "INVALID_WEBHOOK_BODY", "Expected the original JSON request bytes");
      }
      const data = await feesService.handlePaystackWebhook(rawBody, signature, {
        requestId: req.requestId,
      });
      // Paystack expects 200 quickly
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reference } = req.params;
      const data = await feesService.verifyAndFinalize(
        req.auth!.schoolId!,
        reference as string,
        req.auth!.userId
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const feesController = new FeesController();
