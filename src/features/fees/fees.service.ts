import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { auditService } from "../audit/audit.service";
import type {
  CreateFeeStructureInput,
  GenerateInvoicesInput,
  CreateManualPaymentInput,
  updateFeeStructureSchema,
} from "./fees.validation";

import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { generateInvoicesSchema, createManualPaymentSchema, correctInvoiceSchema, reversePaymentSchema } from "./fees.validation";
import {
  initializeTransaction,
  verifyTransaction,
  verifyPaystackSignature,
} from "../../lib/paystack";
import { communicationService } from "../communication/communication.service";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { enqueueReceipt } from "../../lib/studentNotifications";

function deriveInvoiceStatus(
  total: number,
  paid: number,
  current?: InvoiceStatus
): InvoiceStatus {
  if (current === "CANCELLED") return "CANCELLED";
  if (paid <= 0) return total > 0 ? "ISSUED" : "DRAFT";
  if (paid >= total) return "PAID";
  return "PARTIALLY_PAID";
}

async function recalculateInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string
) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { allocations: { where: { reversedAt: null, payment: { status: "SUCCESSFUL" } } } },
  });

  const paidNgn = invoice.allocations.reduce((sum, a) => sum + a.amountNgn, 0);
  const outstandingNgn = Math.max(0, invoice.totalNgn - paidNgn);
  let status = deriveInvoiceStatus(invoice.totalNgn, paidNgn, invoice.status);
  if (status === "ISSUED" && invoice.dueDate && invoice.dueDate < new Date()) status = "OVERDUE";

  return tx.invoice.update({
    where: { id: invoiceId },
    data: { paidNgn, outstandingNgn, status },
  });
}

function nextNumber(prefix: string, seq: number) {
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

export class FeesService {
  // ─── Fee Categories ────────────────────────────────────────────
  async createCategory(
    organizationId: string,
    data: { name: string; description?: string },
    actorId: string,
    meta?: { requestId?: string }
  ) {
    const cat = await prisma.feeCategory.create({
      data: { organizationId, ...data },
    });
    await auditService.write({
      action: "FEE_CREATED",
      actorId,
      organizationId,
      entity: "FeeCategory",
      entityId: cat.id,
      requestId: meta?.requestId,
    });
    return cat;
  }

  async listCategories(organizationId: string, activeOnly = true) {
    return prisma.feeCategory.findMany({
      where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async updateCategory(
    organizationId: string,
    id: string,
    data: Partial<{ name: string; description: string; isActive: boolean }>
  ) {
    const existing = await prisma.feeCategory.findFirst({
      where: { id, organizationId },
    });
    if (!existing)
      throw new AppError(404, "NOT_FOUND", "Fee category not found");
    return prisma.feeCategory.update({ where: { id }, data });
  }

  // ─── Fee Structures ────────────────────────────────────────────
  async createStructure(
    organizationId: string,
    input: CreateFeeStructureInput,
    actorId: string,
    meta?: { requestId?: string }
  ) {
    const total = input.items.reduce((s, i) => s + i.amountNgn, 0);
    if (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647) {
      throw new AppError(
        400,
        "INVALID_AMOUNT",
        "Structure total must be between 1 and 2147483647 NGN"
      );
    }
    const categories = await prisma.feeCategory.count({
      where: { organizationId, isActive: true, id: { in: [...new Set(input.items.map((item) => item.feeCategoryId))] } },
    });
    if (categories !== input.items.length) throw new AppError(400, "INVALID_CATEGORIES", "Use distinct active categories from this school");
    if (input.sessionId && !await prisma.academicSession.findFirst({ where: { id: input.sessionId, organizationId } })) {
      throw new AppError(400, "INVALID_SESSION", "Session does not belong to this school");
    }
    if (input.termId && !await prisma.term.findFirst({
      where: { id: input.termId, session: { organizationId }, ...(input.sessionId ? { sessionId: input.sessionId } : {}) },
    })) throw new AppError(400, "INVALID_TERM", "Term does not belong to this school and session");
    if (input.classId && !await prisma.class.findFirst({ where: { id: input.classId, organizationId, isActive: true } })) {
      throw new AppError(400, "INVALID_CLASS", "Class does not belong to this school");
    }

    const structure = await prisma.$transaction(async (tx) => {
      const fs = await tx.feeStructure.create({
        data: {
          organizationId,
          name: input.name,
          sessionId: input.sessionId ?? null,
          termId: input.termId ?? null,
          classId: input.classId ?? null,
        },
      });

      await tx.feeStructureItem.createMany({
        data: input.items.map((i) => ({
          feeStructureId: fs.id,
          feeCategoryId: i.feeCategoryId,
          amountNgn: i.amountNgn,
        })),
      });

      return tx.feeStructure.findUniqueOrThrow({
        where: { id: fs.id },
        include: { items: { include: { feeCategory: true } } },
      });
    });

    await auditService.write({
      action: "FEE_CREATED",
      actorId,
      organizationId,
      entity: "FeeStructure",
      entityId: structure.id,
      requestId: meta?.requestId,
    });

    return structure;
  }

  async listStructures(organizationId: string) {
    return prisma.feeStructure.findMany({
      where: { organizationId },
      include: {
        items: { include: { feeCategory: true } },
        session: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStructure(organizationId: string, id: string,
    input: z.infer<typeof updateFeeStructureSchema>, actorId: string, requestId?: string) {
    return schoolTransaction(organizationId, async tx => {
      const existing = await tx.feeStructure.findFirst({ where: { id, organizationId } });
      if (!existing) throw new AppError(404, "NOT_FOUND", "Fee structure not found");
      if (input.items) {
        const total = input.items.reduce((sum, item) => sum + item.amountNgn, 0);
        if (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647) {
          throw new AppError(400, "INVALID_AMOUNT", "Fee total must be between 1 and 2147483647 NGN");
        }
        const count = await tx.feeCategory.count({ where: { organizationId, isActive: true,
          id: { in: [...new Set(input.items.map(item => item.feeCategoryId))] } } });
        if (count !== input.items.length) throw new AppError(400, "INVALID_CATEGORIES", "Use distinct active categories from this school");
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
        await tx.feeStructureItem.createMany({ data: input.items.map(item => ({ ...item, feeStructureId: id })) });
      }
      const structure = await tx.feeStructure.update({ where: { id }, data: { name: input.name, isActive: input.isActive },
        include: { items: { include: { feeCategory: true } } } });
      await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", actorId, organizationId, entity: "FeeStructure", entityId: id,
        requestId, metadata: { fields: Object.keys(input) } } });
      return structure;
    });
  }

  async cancelInvoice(organizationId: string, id: string, reason: string, actorId: string, requestId?: string) {
    return schoolTransaction(organizationId, async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id, organizationId }, include: { allocations: true, receipts: true } });
      if (!invoice) throw new AppError(404, "NOT_FOUND", "Invoice not found");
      if (invoice.status === "CANCELLED") return invoice;
      if (invoice.paidNgn !== 0 || invoice.allocations.length || invoice.receipts.length) {
        throw new AppError(409, "INVOICE_HAS_PAYMENTS", "An invoice with payment history cannot be cancelled");
      }
      const cancelled = await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", outstandingNgn: 0 } });
      await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", organizationId, actorId, entity: "Invoice", entityId: id,
        requestId, metadata: { operation: "INVOICE_CANCELLED", reason, previousStatus: invoice.status } } });
      return cancelled;
    });
  }

  async getStructure(organizationId: string, id: string) {
    const fs = await prisma.feeStructure.findFirst({
      where: { id, organizationId },
      include: {
        items: { include: { feeCategory: true } },
        session: true,
        term: true,
      },
    });
    if (!fs) throw new AppError(404, "NOT_FOUND", "Fee structure not found");
    return fs;
  }

  // ─── Generate Invoices ─────────────────────────────────────────
  async generateInvoices(
    organizationId: string,
    input: GenerateInvoicesInput,
    actorId: string,
    meta?: { requestId?: string }
  ) {
    input = generateInvoicesSchema.parse(input);
    const requestHash = createHash("sha256").update(JSON.stringify({
      feeStructureId: input.feeStructureId,
      studentIds: input.studentIds ? [...new Set(input.studentIds)].sort() : null,
      dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    })).digest("hex");
    return schoolTransaction(organizationId, async (tx) => {
      const previous = await tx.invoiceBatch.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      });
      if (previous && previous.requestHash !== requestHash) {
        throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This key was already used with a different invoice request");
      }
      if (previous) {
        const invoices = await tx.invoice.findMany({ where: { organizationId, batchId: previous.id },
          include: { items: true, student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
          orderBy: { invoiceNumber: "asc" } });
        return { created: invoices.length, invoices, batchId: previous.id, replayed: true };
      }
      const structure = await tx.feeStructure.findFirst({ where: { id: input.feeStructureId, organizationId },
        include: { items: { include: { feeCategory: true } } } });
      if (!structure) throw new AppError(404, "NOT_FOUND", "Fee structure not found");
      if (!structure.isActive) throw new AppError(400, "INACTIVE_STRUCTURE", "Fee structure is inactive");
      const students = await tx.student.findMany({
        where: { organizationId, isActive: true, ...(structure.classId ? { classId: structure.classId } : {}),
          ...(input.studentIds ? { id: { in: [...new Set(input.studentIds)] } } : {}) }, select: { id: true },
        orderBy: { id: "asc" },
      });
      if (input.studentIds && students.length !== new Set(input.studentIds).size) {
        throw new AppError(400, "INVALID_STUDENTS", "All students must belong to this school and fee structure class");
      }
      const totalNgn = structure.items.reduce((sum, item) => sum + item.amountNgn, 0);
      if (!Number.isSafeInteger(totalNgn) || totalNgn <= 0 || totalNgn > 2147483647) {
        throw new AppError(400, "INVALID_AMOUNT", "Fee total must be between 1 and 2147483647 NGN");
      }
      const batch = await tx.invoiceBatch.create({ data: { organizationId, idempotencyKey: input.idempotencyKey, requestHash } });
      const counters = await tx.$queryRaw<Array<{ sequence: bigint }>>`
        SELECT COALESCE(MAX(((regexp_match("invoiceNumber", '^INV-([0-9]+)$'))[1])::bigint), 0) AS sequence
        FROM "Invoice" WHERE "organizationId" = ${organizationId}
      `;
      let sequence = Number(counters[0].sequence);
      const invoices = [];
      for (const student of students) {
        invoices.push(await tx.invoice.create({ data: {
          organizationId, batchId: batch.id, studentId: student.id, termId: structure.termId,
          invoiceNumber: nextNumber("INV", ++sequence), status: "ISSUED", totalNgn, paidNgn: 0, outstandingNgn: totalNgn,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          items: { create: structure.items.map(item => ({ feeCategoryId: item.feeCategoryId,
            description: item.feeCategory.name, amountNgn: item.amountNgn })) },
        }, include: { items: true, student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } }));
      }
      await tx.auditLog.create({ data: { action: "INVOICE_CREATED", organizationId, actorId, entity: "InvoiceBatch", entityId: batch.id,
        requestId: meta?.requestId, metadata: { count: invoices.length, feeStructureId: structure.id } } });
      return { created: invoices.length, invoices, batchId: batch.id, replayed: false };
    });
  }
  async listInvoices(
    organizationId: string,
    query: {
      studentId?: string;
      termId?: string;
      status?: InvoiceStatus;
      outstandingOnly?: boolean;
      limit?: number;
    }
  ) {
    const where: Prisma.InvoiceWhereInput = { organizationId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.status) where.status = query.status;
    if (query.outstandingOnly) where.outstandingNgn = { gt: 0 };

    return prisma.invoice.findMany({
      where,
      take: query.limit ?? 50,
      orderBy: { issuedAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        items: true,
        term: { select: { id: true, name: true } },
      },
    });
  }

  async getInvoice(organizationId: string, id: string) {
    const inv = await prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        student: true,
        items: { include: { feeCategory: true } },
        allocations: { include: { payment: true } },
        receipts: true,
        term: true,
      },
    });
    if (!inv) throw new AppError(404, "NOT_FOUND", "Invoice not found");
    return inv;
  }

  // ─── Manual Payments + Allocation ──────────────────────────────
  async correctInvoice(organizationId: string, id: string, input: z.infer<typeof correctInvoiceSchema>, actorId: string, requestId?: string) {
    input = correctInvoiceSchema.parse(input);
    return schoolTransaction(organizationId, async tx => {
      const invoice = await tx.invoice.findFirst({ where: { id, organizationId }, include: { items: true, allocations: true, receipts: true } });
      if (!invoice) throw new AppError(404, "NOT_FOUND", "Invoice not found");
      if (invoice.status === "CANCELLED" || invoice.paidNgn !== 0 || invoice.allocations.length || invoice.receipts.length) {
        throw new AppError(409, "INVOICE_LOCKED", "Only unpaid invoices without payment history can be corrected");
      }
      let totalNgn = invoice.totalNgn;
      if (input.items) {
        totalNgn = input.items.reduce((sum, item) => sum + item.amountNgn, 0);
        if (!Number.isSafeInteger(totalNgn) || totalNgn <= 0 || totalNgn > 2147483647) throw new AppError(400, "INVALID_AMOUNT", "Invoice total must fit a positive integer NGN amount");
        const categories = await tx.feeCategory.findMany({ where: { organizationId, isActive: true,
          id: { in: [...new Set(input.items.map(item => item.feeCategoryId))] } } });
        if (categories.length !== input.items.length) throw new AppError(400, "INVALID_CATEGORIES", "Use distinct active school categories");
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceItem.createMany({ data: input.items.map(item => ({ ...item, invoiceId: id,
          description: categories.find(category => category.id === item.feeCategoryId)!.name })) });
      }
      const dueDate = input.dueDate === undefined ? invoice.dueDate : input.dueDate === null ? null : new Date(input.dueDate);
      const corrected = await tx.invoice.update({ where: { id }, data: { totalNgn, outstandingNgn: totalNgn, dueDate,
        status: dueDate && dueDate < new Date() ? "OVERDUE" : totalNgn > 0 ? "ISSUED" : "DRAFT" }, include: { items: true } });
      await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", organizationId, actorId, entity: "Invoice", entityId: id,
        requestId, metadata: { operation: "INVOICE_CORRECTED", reason: input.reason,
          before: { totalNgn: invoice.totalNgn, dueDate: invoice.dueDate?.toISOString() ?? null, items: invoice.items },
          after: { totalNgn, dueDate: dueDate?.toISOString() ?? null, items: corrected.items } } } });
      return corrected;
    });
  }

  async getPayment(organizationId: string, id: string) {
    const payment = await prisma.payment.findFirst({ where: { organizationId, id },
      include: { allocations: { include: { invoice: true } }, receipts: true } });
    if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
    return payment;
  }

  async reverseManualPayment(organizationId: string, id: string, reason: string, actorId: string, requestId?: string) {
    reason = reversePaymentSchema.parse({ reason }).reason;
    return schoolTransaction(organizationId, async tx => {
      const payment = await tx.payment.findFirst({ where: { id, organizationId },
        include: { allocations: { include: { invoice: { select: { organizationId: true } } } }, receipts: true } });
      if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
      if (payment.source !== "MANUAL") throw new AppError(409, "MANUAL_PAYMENT_REQUIRED", "Provider payments need a provider refund workflow");
      if (payment.status === "REVERSED") {
        if (payment.reversalReason !== reason) throw new AppError(409, "REVERSAL_CONFLICT", "Payment was already reversed with another reason");
        return payment;
      }
      if (payment.status !== "SUCCESSFUL") throw new AppError(409, "INVALID_STATUS", "Only successful manual payments can be reversed");
      if (payment.allocations.some(allocation => allocation.invoice.organizationId !== organizationId) ||
          payment.receipts.some(receipt => receipt.organizationId !== organizationId)) {
        throw new AppError(409, "INVALID_PAYMENT_HISTORY", "Payment history requires reconciliation before reversal");
      }
      const reversedAt = new Date();
      await tx.payment.update({ where: { id }, data: { status: "REVERSED", reversedAt, reversalReason: reason } });
      await tx.paymentAllocation.updateMany({ where: { paymentId: id, reversedAt: null }, data: { reversedAt } });
      await tx.receipt.updateMany({ where: { paymentId: id, organizationId, voidedAt: null }, data: { voidedAt: reversedAt } });
      await tx.notificationOutbox.updateMany({ where: { organizationId, entityType: "Receipt", entityId: { in: payment.receipts.map(receipt => receipt.id) }, status: "PENDING" },
        data: { status: "CANCELLED", lockedAt: null, error: "PAYMENT_REVERSED" } });
      for (const invoiceId of new Set(payment.allocations.map(allocation => allocation.invoiceId))) await recalculateInvoice(tx, invoiceId);
      await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", organizationId, actorId, entity: "Payment", entityId: id,
        requestId, metadata: { operation: "MANUAL_PAYMENT_REVERSED", reason, amountNgn: payment.amountNgn,
          allocationIds: payment.allocations.map(allocation => allocation.id), receiptIds: payment.receipts.map(receipt => receipt.id) } } });
      return tx.payment.findUniqueOrThrow({ where: { id }, include: { allocations: true, receipts: true } });
    });
  }

  async createManualPayment(
    organizationId: string,
    input: CreateManualPaymentInput,
    recordedById: string,
    meta?: { requestId?: string }
  ) {
    input = createManualPaymentSchema.parse(input);
    const requestHash = createHash("sha256").update(JSON.stringify({
      amountNgn: input.amountNgn, method: input.method, note: input.note ?? null,
      paidAt: input.paidAt ? new Date(input.paidAt).toISOString() : null,
      allocations: [...(input.allocations ?? [])].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId) || a.amountNgn - b.amountNgn),
    })).digest("hex");
    return schoolTransaction(organizationId, async tx => {
      const previous = await tx.payment.findUnique({ where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
        include: { allocations: { include: { invoice: true } }, receipts: true } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This key was used with a different payment request");
        return { ...previous, replayed: true };
      }
      const payment = await tx.payment.create({ data: { organizationId, amountNgn: input.amountNgn,
        method: input.method, source: "MANUAL", status: "SUCCESSFUL", recordedById,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), note: input.note,
        idempotencyKey: input.idempotencyKey, requestHash } });
      if (input.allocations?.length) await this._allocateInTx(tx, organizationId, payment.id, payment.amountNgn, input.allocations);
      await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", actorId: recordedById, organizationId,
        entity: "Payment", entityId: payment.id, requestId: meta?.requestId,
        metadata: { amountNgn: payment.amountNgn, method: payment.method } } });
      const result = await tx.payment.findUniqueOrThrow({ where: { id: payment.id },
        include: { allocations: { include: { invoice: true } }, receipts: true } });
      return { ...result, replayed: false };
    });
  }
  async allocatePayment(
    organizationId: string,
    paymentId: string,
    allocations: { invoiceId: string; amountNgn: number }[],
    actorId: string,
    meta?: { requestId?: string }
  ) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
    });
    if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");
    if (payment.status !== "SUCCESSFUL") {
      throw new AppError(
        400,
        "INVALID_STATUS",
        "Only successful payments can be allocated"
      );
    }

    return schoolTransaction(organizationId, async tx => {
      const result = await this._allocateInTx(tx, organizationId, paymentId, payment.amountNgn, allocations);
      await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", actorId, organizationId,
        entity: "PaymentAllocation", entityId: paymentId, requestId: meta?.requestId,
        metadata: { operation: "PAYMENT_ALLOCATED", allocationIds: result.map(row => row.id) } } });
      return result;
    });
  }
  private async _allocateInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    paymentId: string,
    paymentAmount: number,
    allocations: { invoiceId: string; amountNgn: number }[]
  ) {
    // Recheck after acquiring the school lock: a reversal may have committed
    // while an allocation caller was waiting for the lock.
    const current = await tx.payment.findFirst({ where: { id: paymentId, organizationId } });
    if (!current) throw new AppError(404, "NOT_FOUND", "Payment not found");
    if (current.status !== "SUCCESSFUL") throw new AppError(409, "INVALID_STATUS", "Only successful payments can be allocated");
    paymentAmount = current.amountNgn;
    // Existing active allocations for this payment
    const existing = await tx.paymentAllocation.findMany({
      where: { paymentId, reversedAt: null },
    });
    const alreadyAllocated = existing.reduce((s, a) => s + a.amountNgn, 0);
    const remainingPayment = paymentAmount - alreadyAllocated;

    const totalNew = allocations.reduce((s, a) => s + a.amountNgn, 0);
    if (totalNew > remainingPayment) {
      throw new AppError(
        400,
        "OVER_ALLOCATION",
        `Cannot allocate ${totalNew}; only ${remainingPayment} remaining on payment`
      );
    }

    const created = [];
    for (const alloc of allocations) {
      if (!Number.isSafeInteger(alloc.amountNgn) || alloc.amountNgn <= 0) {
        throw new AppError(400, "INVALID_AMOUNT", "Allocation must be a positive whole naira amount");
      }
      const invoice = await tx.invoice.findFirst({
        where: { id: alloc.invoiceId, organizationId },
      });
      if (!invoice) {
        throw new AppError(
          404,
          "INVOICE_NOT_FOUND",
          `Invoice ${alloc.invoiceId} not found`
        );
      }
      if (invoice.status === "CANCELLED") throw new AppError(400, "CANCELLED_INVOICE", "Cannot allocate to a cancelled invoice");
      if (alloc.amountNgn > invoice.outstandingNgn) {
        throw new AppError(
          400,
          "OVER_OUTSTANDING",
          `Allocation ${alloc.amountNgn} exceeds invoice outstanding ${invoice.outstandingNgn}`
        );
      }

      const row = await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceId: alloc.invoiceId,
          amountNgn: alloc.amountNgn,
        },
      });
      created.push(row);

      await recalculateInvoice(tx, alloc.invoiceId);

      // Auto-issue receipt for this allocation (simple V1 rule)
      const counters = await tx.$queryRaw<Array<{ sequence: bigint }>>`
        SELECT COALESCE(MAX(((regexp_match("receiptNumber", '^RCPT-([0-9]+)$'))[1])::bigint), 0) AS sequence
        FROM "Receipt" WHERE "organizationId" = ${organizationId}
      `;
      const rseq = Number(counters[0].sequence) + 1;

      const receipt = await tx.receipt.create({
        data: {
          organizationId,
          paymentId,
          invoiceId: alloc.invoiceId,
          receiptNumber: nextNumber("RCPT", rseq),
          amountNgn: alloc.amountNgn,
        },
      });
      await enqueueReceipt(tx, organizationId, receipt, invoice.studentId);
    }

    return created;
  }

  // ─── Receipts ──────────────────────────────────────────────────
  async getReceipt(organizationId: string, id: string) {
    const r = await prisma.receipt.findFirst({
      where: { id, organizationId },
      include: {
        payment: true,
        invoice: { include: { student: true, items: true } },
      },
    });
    if (!r) throw new AppError(404, "NOT_FOUND", "Receipt not found");
    return r;
  }

  async listReceipts(organizationId: string, paymentId?: string) {
    return prisma.receipt.findMany({
      where: { organizationId, ...(paymentId ? { paymentId } : {}) },
      orderBy: { issuedAt: "desc" },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                admissionNumber: true,
              },
            },
          },
        },
      },
    });
  }

  // ─── Parent view ───────────────────────────────────────────────
  async parentFees(organizationId: string, parentUserId: string) {
    const parent = await prisma.parent.findFirst({
      where: { organizationId, userId: parentUserId, isActive: true },
      select: { id: true },
    });
    if (!parent) throw new AppError(403, "NOT_A_PARENT", "No parent profile");

    const links = await prisma.parentStudent.findMany({
      where: { parentId: parent.id, organizationId, student: { organizationId } },
      select: { studentId: true },
    });
    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return { children: [] };

    const invoices = await prisma.invoice.findMany({
      where: { organizationId, studentId: { in: studentIds } },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          },
        },
        items: true,
        receipts: true,
      },
      orderBy: { issuedAt: "desc" },
    });

    return { invoices };
  }

  // ─── Bursar summary ────────────────────────────────────────────
  async bursarSummary(
    organizationId: string,
    opts?: { from?: string; to?: string }
  ) {
    const paymentWhere: Prisma.PaymentWhereInput = {
      organizationId,
      status: "SUCCESSFUL",
    };
    if (opts?.from || opts?.to) {
      paymentWhere.paidAt = {};
      if (opts.from) (paymentWhere.paidAt as any).gte = new Date(opts.from);
      if (opts.to) (paymentWhere.paidAt as any).lte = new Date(opts.to);
    }

    const [collected, outstanding, invoiceCount] = await Promise.all([
      prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amountNgn: true },
      }),
      prisma.invoice.aggregate({
        where: {
          organizationId,
          outstandingNgn: { gt: 0 },
          status: { not: "CANCELLED" },
        },
        _sum: { outstandingNgn: true },
      }),
      prisma.invoice.count({
        where: {
          organizationId,
          outstandingNgn: { gt: 0 },
          status: { not: "CANCELLED" },
        },
      }),
    ]);

    return {
      collectedNgn: collected._sum.amountNgn ?? 0,
      outstandingNgn: outstanding._sum.outstandingNgn ?? 0,
      invoicesWithBalance: invoiceCount,
    };
  }

  async initializeOnlinePayment(
    organizationId: string,
    input: {
      amountNgn: number;
      email: string;
      studentId?: string;
      invoiceIds?: string[];
      callbackUrl?: string;
      metadata?: Record<string, any>;
    },
    recordedById: string | null,
    meta?: { requestId?: string }
  ) {
    if (!Number.isSafeInteger(input.amountNgn) || input.amountNgn <= 0 || !Number.isSafeInteger(input.amountNgn * 100)) {
      throw new AppError(400, "INVALID_AMOUNT", "Payment amount must be a positive whole naira amount");
    }
    if (input.studentId && !await prisma.student.findFirst({ where: { id: input.studentId, organizationId, isActive: true } })) {
      throw new AppError(400, "INVALID_STUDENT", "Student must belong to this school");
    }
    // Validate invoices belong to school and still have outstanding
    if (input.invoiceIds?.length) {
      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: input.invoiceIds },
          organizationId,
          outstandingNgn: { gt: 0 },
          status: { not: "CANCELLED" },
          ...(input.studentId ? { studentId: input.studentId } : {}),
        },
      });
      if (invoices.length !== input.invoiceIds.length) {
        throw new AppError(
          400,
          "INVALID_INVOICES",
          "One or more invoices are invalid or fully paid"
        );
      }
    }

    const reference = `sch_${organizationId.slice(0, 8)}_${randomBytes(
      8
    ).toString("hex")}`;

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        amountNgn: input.amountNgn,
        status: "PENDING",
        method: "ONLINE",
        source: "PAYSTACK",
        providerReference: reference,
        recordedById,
        note: input.studentId ? `Student ${input.studentId}` : undefined,
        providerPayload: {
          ...input.metadata,
          invoiceIds: input.invoiceIds ?? [],
          studentId: input.studentId,
        },
      },
    });

    const amountKobo = input.amountNgn * 100;

    const paystack = await initializeTransaction({
      email: input.email,
      amountKobo,
      reference,
      callback_url:
        input.callbackUrl || `${process.env.APP_URL}/payments/callback`,
      metadata: {
        organizationId,
        paymentId: payment.id,
        invoiceIds: input.invoiceIds,
        studentId: input.studentId,
        custom_fields: [
          {
            display_name: "Payment ID",
            variable_name: "payment_id",
            value: payment.id,
          },
        ],
      },
    });

    await auditService.write({
      action: "PAYMENT_CREATED",
      actorId: recordedById ?? undefined,
      organizationId,
      entity: "Payment",
      entityId: payment.id,
      metadata: { source: "PAYSTACK", reference },
      requestId: meta?.requestId,
    });

    return {
      paymentId: payment.id,
      reference,
      authorizationUrl: paystack.authorization_url,
      accessCode: paystack.access_code,
    };
  }

  /**
   * Called only from the webhook (or a manual verify endpoint for recovery).
   * Idempotent by providerReference.
   */
  async handlePaystackWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
    meta?: { requestId?: string }
  ) {
    if (!verifyPaystackSignature(rawBody, signature)) {
      throw new AppError(
        401,
        "INVALID_SIGNATURE",
        "Invalid Paystack signature"
      );
    }

    const event =
      typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : JSON.parse(rawBody.toString());
    const { event: eventType, data } = event;

    // We only care about successful charges for now
    if (eventType !== "charge.success") {
      return { ignored: true, event: eventType };
    }

    const reference = data.reference as string;

    return this.finalizePaystackPayment(reference, data, meta);
  }

  async finalizePaystackPayment(
    reference: string,
    rawData?: any,
    meta?: { requestId?: string }
  ) {
    // 1. Find our pending payment
    const payment = await prisma.payment.findFirst({
      where: { providerReference: reference, source: "PAYSTACK" },
    });
    if (!payment) {
      // Could be a payment we don't know about — ignore or log
      return { status: "ignored", reason: "payment_not_found" };
    }

    // Idempotency: already processed
    if (payment.status === "SUCCESSFUL") {
      return { status: "already_processed", paymentId: payment.id };
    }
    if (payment.status === "REFUNDED" || payment.status === "REVERSED") {
      return { status: "ignored", reason: "payment_closed", paymentId: payment.id };
    }

    // 2. Server-side verify with Paystack (never trust webhook body alone)
    const verified = await verifyTransaction(reference);

    if (verified.status !== "success") {
      if (verified.status === "pending" || verified.status === "ongoing" || verified.status === "processing" || verified.status === "queued") {
        return { status: "pending", paymentId: payment.id };
      }
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: "FAILED",
          providerPayload: { ...(payment.providerPayload as any), verified },
        },
      });
      return { status: "failed", paymentId: payment.id };
    }

    // Amount check (kobo → naira)
    if (verified.amount !== payment.amountNgn * 100 || verified.currency !== "NGN" || verified.reference !== reference) {
      throw new AppError(409, "PAYMENT_MISMATCH", "Verified amount, currency or reference does not match this payment");
    }

    // 3. Mark successful + allocate inside one transaction
    const result = await schoolTransaction(payment.organizationId, async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === "SUCCESSFUL") return current;
      if (current.status === "REFUNDED" || current.status === "REVERSED") {
        throw new AppError(409, "PAYMENT_CLOSED", "A closed payment cannot be credited again");
      }
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESSFUL",
          paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
          providerPayload: {
            ...(payment.providerPayload as any),
            verified,
            webhook: rawData,
          },
        },
      });

      // Auto-allocate if invoiceIds were stored at initialize time
      const payload = payment.providerPayload as any;
      const invoiceIds: string[] = payload?.invoiceIds || [];

      if (invoiceIds.length > 0) {
        // Simple FIFO allocation across the supplied invoices
        let remaining = updated.amountNgn;
        const allocations: { invoiceId: string; amountNgn: number }[] = [];

        for (const invId of invoiceIds) {
          if (remaining <= 0) break;
          const inv = await tx.invoice.findFirst({
            where: { id: invId, organizationId: payment.organizationId },
          });
          if (!inv || inv.status === "CANCELLED" || inv.outstandingNgn <= 0) continue;

          const allocAmount = Math.min(remaining, inv.outstandingNgn);
          allocations.push({ invoiceId: invId, amountNgn: allocAmount });
          remaining -= allocAmount;
        }

        if (allocations.length) {
          await this._allocateInTx(
            tx,
            payment.organizationId,
            payment.id,
            updated.amountNgn,
            allocations
          );
        }
      }

      await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", organizationId: payment.organizationId,
        entity: "Payment", entityId: payment.id, metadata: { source: "PAYSTACK", reference, status: "SUCCESSFUL" }, requestId: meta?.requestId } });
      return updated;
    });
    return { status: "success", paymentId: result.id };
  }

  /** Optional recovery endpoint for staff */
  async verifyAndFinalize(
    organizationId: string,
    reference: string,
    actorId: string
  ) {
    const payment = await prisma.payment.findFirst({
      where: { organizationId, providerReference: reference },
    });
    if (!payment) throw new AppError(404, "NOT_FOUND", "Payment not found");

    return this.finalizePaystackPayment(reference, undefined, {
      requestId: undefined,
    });
  }
}

export const feesService = new FeesService();
