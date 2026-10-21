"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feesController = exports.FeesController = void 0;
// import { feesService } from "./fees.service";
const fees_validation_1 = require("./fees.validation");
const http_1 = require("../../lib/http");
const fees_service_1 = require("./fees.service");
const errors_1 = require("../../lib/errors");
class FeesController {
    correctInvoice = async (req, res, next) => {
        try {
            (0, http_1.sendSuccess)(res, await fees_service_1.feesService.correctInvoice(req.auth.schoolId, req.params.id, fees_validation_1.correctInvoiceSchema.parse(req.body), req.auth.userId, req.requestId));
        }
        catch (error) {
            next(error);
        }
    };
    reversePayment = async (req, res, next) => {
        try {
            const { reason } = fees_validation_1.reversePaymentSchema.parse(req.body);
            (0, http_1.sendSuccess)(res, await fees_service_1.feesService.reverseManualPayment(req.auth.schoolId, req.params.id, reason, req.auth.userId, req.requestId));
        }
        catch (error) {
            next(error);
        }
    };
    getPayment = async (req, res, next) => {
        try {
            (0, http_1.sendSuccess)(res, await fees_service_1.feesService.getPayment(req.auth.schoolId, req.params.id));
        }
        catch (error) {
            next(error);
        }
    };
    // Categories
    createCategory = async (req, res, next) => {
        try {
            const input = fees_validation_1.createFeeCategorySchema.parse(req.body);
            const data = await fees_service_1.feesService.createCategory(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    listCategories = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.listCategories(req.auth.schoolId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    updateCategory = async (req, res, next) => {
        try {
            const input = fees_validation_1.updateFeeCategorySchema.parse(req.body);
            const data = await fees_service_1.feesService.updateCategory(req.auth.schoolId, req.params.id, input);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    // Structures
    updateStructure = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.updateStructure(req.auth.schoolId, req.params.id, fees_validation_1.updateFeeStructureSchema.parse(req.body), req.auth.userId, req.requestId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    cancelInvoice = async (req, res, next) => {
        try {
            const { reason } = fees_validation_1.cancelInvoiceSchema.parse(req.body);
            const data = await fees_service_1.feesService.cancelInvoice(req.auth.schoolId, req.params.id, reason, req.auth.userId, req.requestId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    createStructure = async (req, res, next) => {
        try {
            const input = fees_validation_1.createFeeStructureSchema.parse(req.body);
            const data = await fees_service_1.feesService.createStructure(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    listStructures = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.listStructures(req.auth.schoolId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getStructure = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.getStructure(req.auth.schoolId, req.params.id);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    // Invoices
    generateInvoices = async (req, res, next) => {
        try {
            const input = fees_validation_1.generateInvoicesSchema.parse(req.body);
            const data = await fees_service_1.feesService.generateInvoices(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, data.replayed ? 200 : 201);
        }
        catch (err) {
            next(err);
        }
    };
    listInvoices = async (req, res, next) => {
        try {
            const query = fees_validation_1.listInvoicesQuerySchema.parse(req.query);
            const data = await fees_service_1.feesService.listInvoices(req.auth.schoolId, query);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getInvoice = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.getInvoice(req.auth.schoolId, req.params.id);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    // Payments
    createManualPayment = async (req, res, next) => {
        try {
            const input = fees_validation_1.createManualPaymentSchema.parse(req.body);
            const data = await fees_service_1.feesService.createManualPayment(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, data.replayed ? 200 : 201);
        }
        catch (err) {
            next(err);
        }
    };
    allocatePayment = async (req, res, next) => {
        try {
            const input = fees_validation_1.allocatePaymentSchema.parse(req.body);
            const data = await fees_service_1.feesService.allocatePayment(req.auth.schoolId, req.params.id, input.allocations, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    // Receipts
    getReceipt = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.getReceipt(req.auth.schoolId, req.params.id);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    listReceipts = async (req, res, next) => {
        try {
            const paymentId = typeof req.query.paymentId === "string"
                ? req.query.paymentId
                : undefined;
            const data = await fees_service_1.feesService.listReceipts(req.auth.schoolId, paymentId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    // Parent + Bursar
    parentFees = async (req, res, next) => {
        try {
            const data = await fees_service_1.feesService.parentFees(req.auth.schoolId, req.auth.userId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    bursarSummary = async (req, res, next) => {
        try {
            const from = typeof req.query.from === "string" ? req.query.from : undefined;
            const to = typeof req.query.to === "string" ? req.query.to : undefined;
            const data = await fees_service_1.feesService.bursarSummary(req.auth.schoolId, {
                from,
                to,
            });
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    initializeOnline = async (req, res, next) => {
        try {
            const input = fees_validation_1.initializePaymentSchema.parse(req.body);
            const data = await fees_service_1.feesService.initializeOnlinePayment(req.auth.schoolId, input, req.auth.userId, { requestId: req.requestId });
            (0, http_1.sendSuccess)(res, data, 201);
        }
        catch (err) {
            next(err);
        }
    };
    // Webhook must receive raw body for signature verification
    webhook = async (req, res, next) => {
        try {
            const signature = req.headers["x-paystack-signature"];
            // req.rawBody must be set by a raw-body middleware on this route only
            const rawBody = req.rawBody;
            if (!Buffer.isBuffer(rawBody)) {
                throw new errors_1.AppError(400, "INVALID_WEBHOOK_BODY", "Expected the original JSON request bytes");
            }
            const data = await fees_service_1.feesService.handlePaystackWebhook(rawBody, signature, {
                requestId: req.requestId,
            });
            // Paystack expects 200 quickly
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    };
    verifyPayment = async (req, res, next) => {
        try {
            const { reference } = req.params;
            const data = await fees_service_1.feesService.verifyAndFinalize(req.auth.schoolId, reference, req.auth.userId);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.FeesController = FeesController;
exports.feesController = new FeesController();
