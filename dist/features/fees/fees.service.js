"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feesService = exports.FeesService = void 0;
const financeWorkspace_1 = require("./financeWorkspace");
const rbac_1 = require("../../auth/rbac");
const itemBalances_1 = require("./itemBalances");
const paymentConfig_1 = require("./paymentConfig");
const bankAccount_1 = require("../schools/bankAccount");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const audit_service_1 = require("../audit/audit.service");
const crypto_1 = require("crypto");
const fees_validation_1 = require("./fees.validation");
const paystack_1 = require("../../lib/paystack");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const studentNotifications_1 = require("../../lib/studentNotifications");
function deriveInvoiceStatus(total, paid, current) {
    if (current === "CANCELLED")
        return "CANCELLED";
    if (paid <= 0)
        return total > 0 ? "ISSUED" : "DRAFT";
    if (paid >= total)
        return "PAID";
    return "PARTIALLY_PAID";
}
async function recalculateInvoice(tx, invoiceId) {
    const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: { allocations: { where: { reversedAt: null, payment: { status: "SUCCESSFUL" } } } },
    });
    const paidNgn = invoice.allocations.reduce((sum, a) => sum + a.amountNgn, 0);
    const outstandingNgn = Math.max(0, invoice.totalNgn - paidNgn);
    let status = deriveInvoiceStatus(invoice.totalNgn, paidNgn, invoice.status);
    if (status === "ISSUED" && invoice.dueDate && invoice.dueDate < new Date())
        status = "OVERDUE";
    return tx.invoice.update({
        where: { id: invoiceId },
        data: { paidNgn, outstandingNgn, status },
    });
}
function nextNumber(prefix, seq) {
    return `${prefix}-${String(seq).padStart(6, "0")}`;
}
class FeesService {
    // ─── Fee Categories ────────────────────────────────────────────
    async createCategory(organizationId, data, actorId, meta) {
        const cat = await prisma_1.prisma.feeCategory.create({
            data: { organizationId, ...data },
        });
        await audit_service_1.auditService.write({
            action: "FEE_CREATED",
            actorId,
            organizationId,
            entity: "FeeCategory",
            entityId: cat.id,
            requestId: meta?.requestId,
        });
        return cat;
    }
    async listCategories(organizationId, activeOnly = true) {
        return prisma_1.prisma.feeCategory.findMany({
            where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
            orderBy: { name: "asc" },
        });
    }
    async updateCategory(organizationId, id, data) {
        const existing = await prisma_1.prisma.feeCategory.findFirst({
            where: { id, organizationId },
        });
        if (!existing)
            throw new errors_1.AppError(404, "NOT_FOUND", "Fee category not found");
        return prisma_1.prisma.feeCategory.update({ where: { id }, data });
    }
    // ─── Fee Structures ────────────────────────────────────────────
    async createStructure(organizationId, input, actorId, meta) {
        const total = input.items.reduce((s, i) => s + i.amountNgn, 0);
        if (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647) {
            throw new errors_1.AppError(400, "INVALID_AMOUNT", "Structure total must be between 1 and 2147483647 NGN");
        }
        const categories = await prisma_1.prisma.feeCategory.count({
            where: { organizationId, isActive: true, id: { in: [...new Set(input.items.map((item) => item.feeCategoryId))] } },
        });
        if (categories !== input.items.length)
            throw new errors_1.AppError(400, "INVALID_CATEGORIES", "Use distinct active categories from this school");
        if (input.sessionId && !await prisma_1.prisma.academicSession.findFirst({ where: { id: input.sessionId, organizationId } })) {
            throw new errors_1.AppError(400, "INVALID_SESSION", "Session does not belong to this school");
        }
        if (input.termId && !await prisma_1.prisma.term.findFirst({
            where: { id: input.termId, session: { organizationId }, ...(input.sessionId ? { sessionId: input.sessionId } : {}) },
        }))
            throw new errors_1.AppError(400, "INVALID_TERM", "Term does not belong to this school and session");
        if (input.classId && !await prisma_1.prisma.class.findFirst({ where: { id: input.classId, organizationId, isActive: true } })) {
            throw new errors_1.AppError(400, "INVALID_CLASS", "Class does not belong to this school");
        }
        const structure = await prisma_1.prisma.$transaction(async (tx) => {
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
        await audit_service_1.auditService.write({
            action: "FEE_CREATED",
            actorId,
            organizationId,
            entity: "FeeStructure",
            entityId: structure.id,
            requestId: meta?.requestId,
        });
        return structure;
    }
    async listStructures(organizationId) {
        const structures = await prisma_1.prisma.feeStructure.findMany({
            where: { organizationId },
            include: {
                items: { include: { feeCategory: true } },
                session: { select: { id: true, name: true } },
                term: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        const [students, batches] = await Promise.all([
            prisma_1.prisma.student.groupBy({ by: ['classId'], where: { organizationId, isActive: true }, _count: { _all: true } }),
            prisma_1.prisma.invoiceBatch.findMany({ where: { organizationId, idempotencyKey: { in: structures.map(s => 'fee-plan-' + s.id) } },
                select: { id: true, idempotencyKey: true } }),
        ]);
        const billed = batches.length ? await prisma_1.prisma.invoice.groupBy({ by: ['batchId'],
            where: { organizationId, batchId: { in: batches.map(b => b.id) }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
            _count: { _all: true }, _sum: { totalNgn: true, paidNgn: true } }) : [];
        const assigned = await prisma_1.prisma.invoice.groupBy({ by: ['feeStructureId'], where: { organizationId, feeStructureId: { in: structures.filter(s => s.autoBill).map(s => s.id) }, status: { notIn: ['CANCELLED', 'DRAFT'] } }, _count: { _all: true }, _sum: { totalNgn: true, paidNgn: true } });
        return structures.map(structure => {
            if (structure.autoBill) {
                const actual = assigned.find(i => i.feeStructureId === structure.id);
                return { ...structure, recipientCount: actual?._count._all ?? 0, isBilled: true, expectedIncomeNgn: actual?._sum.totalNgn ?? 0, receivedNgn: actual?._sum.paidNgn ?? 0 };
            }
            const batch = batches.find(b => b.idempotencyKey === 'fee-plan-' + structure.id);
            const totals = billed.find(i => i.batchId === batch?.id);
            const recipientCount = batch ? totals?._count._all ?? 0 : students.filter(s => !structure.classId || s.classId === structure.classId).reduce((sum, s) => sum + s._count._all, 0);
            const amount = structure.items.reduce((sum, item) => sum + item.amountNgn, 0);
            return { ...structure, recipientCount, isBilled: !!batch,
                expectedIncomeNgn: batch ? totals?._sum.totalNgn ?? 0 : recipientCount * amount,
                receivedNgn: totals?._sum.paidNgn ?? 0 };
        });
    }
    async updateStructure(organizationId, id, input, actorId, requestId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const existing = await tx.feeStructure.findFirst({ where: { id, organizationId } });
            if (!existing)
                throw new errors_1.AppError(404, "NOT_FOUND", "Fee structure not found");
            if (existing.autoBill)
                throw new errors_1.AppError(409, "USE_FEE_ASSIGNMENT", "Edit this fee through the class fee schedule so student bills stay consistent.");
            if (input.items) {
                const total = input.items.reduce((sum, item) => sum + item.amountNgn, 0);
                if (!Number.isSafeInteger(total) || total <= 0 || total > 2147483647) {
                    throw new errors_1.AppError(400, "INVALID_AMOUNT", "Fee total must be between 1 and 2147483647 NGN");
                }
                const count = await tx.feeCategory.count({ where: { organizationId, isActive: true,
                        id: { in: [...new Set(input.items.map(item => item.feeCategoryId))] } } });
                if (count !== input.items.length)
                    throw new errors_1.AppError(400, "INVALID_CATEGORIES", "Use distinct active categories from this school");
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
    async cancelInvoice(organizationId, id, reason, actorId, requestId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, organizationId }, include: { allocations: true, receipts: true } });
            if (!invoice)
                throw new errors_1.AppError(404, "NOT_FOUND", "Invoice not found");
            if (invoice.status === "CANCELLED")
                return invoice;
            if (invoice.paidNgn !== 0 || invoice.allocations.length || invoice.receipts.length) {
                throw new errors_1.AppError(409, "INVOICE_HAS_PAYMENTS", "An invoice with payment history cannot be cancelled");
            }
            const cancelled = await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", outstandingNgn: 0 } });
            await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", organizationId, actorId, entity: "Invoice", entityId: id,
                    requestId, metadata: { operation: "INVOICE_CANCELLED", reason, previousStatus: invoice.status } } });
            return cancelled;
        });
    }
    async getStructure(organizationId, id) {
        const fs = await prisma_1.prisma.feeStructure.findFirst({
            where: { id, organizationId },
            include: {
                items: { include: { feeCategory: true } },
                session: true,
                term: true,
            },
        });
        if (!fs)
            throw new errors_1.AppError(404, "NOT_FOUND", "Fee structure not found");
        return fs;
    }
    // ─── Generate Invoices ─────────────────────────────────────────
    async generateInvoices(organizationId, input, actorId, meta) {
        input = fees_validation_1.generateInvoicesSchema.parse(input);
        const requestHash = (0, crypto_1.createHash)("sha256").update(JSON.stringify({
            feeStructureId: input.feeStructureId,
            studentIds: input.studentIds ? [...new Set(input.studentIds)].sort() : null,
            dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
            ...(input.classIds ? { classIds: [...new Set(input.classIds)].sort() } : {}),
        })).digest("hex");
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const previous = await tx.invoiceBatch.findUnique({
                where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
            });
            if (previous && previous.requestHash !== requestHash) {
                throw new errors_1.AppError(409, "IDEMPOTENCY_CONFLICT", "This key was already used with a different invoice request");
            }
            if (previous) {
                const invoices = await tx.invoice.findMany({ where: { organizationId, batchId: previous.id },
                    include: { items: true, student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
                    orderBy: { invoiceNumber: "asc" } });
                return { created: invoices.length, invoices, batchId: previous.id, replayed: true };
            }
            const structure = await tx.feeStructure.findFirst({ where: { id: input.feeStructureId, organizationId },
                include: { items: { include: { feeCategory: true } } } });
            if (!structure)
                throw new errors_1.AppError(404, "NOT_FOUND", "Fee structure not found");
            if (!structure.isActive)
                throw new errors_1.AppError(400, "INACTIVE_STRUCTURE", "Fee structure is inactive");
            if (structure.autoBill)
                throw new errors_1.AppError(409, "ALREADY_ASSIGNED", "This schedule already creates student bills automatically. Edit the fee schedule instead.");
            if (input.classIds) {
                const classIds = [...new Set(input.classIds)];
                const count = await tx.class.count({ where: { organizationId, isActive: true, id: { in: classIds } } });
                if (count !== classIds.length || (structure.classId && classIds.some(id => id !== structure.classId))) {
                    throw new errors_1.AppError(400, "INVALID_CLASSES", "Select active classes from this school that match the fee plan");
                }
            }
            const students = await tx.student.findMany({
                where: { organizationId, isActive: true, ...(structure.classId ? { classId: structure.classId } : {}),
                    ...(input.classIds ? { classId: { in: [...new Set(input.classIds)] } } : {}),
                    ...(input.studentIds ? { id: { in: [...new Set(input.studentIds)] } } : {}) }, select: { id: true },
                orderBy: { id: "asc" },
            });
            if (input.studentIds && students.length !== new Set(input.studentIds).size) {
                throw new errors_1.AppError(400, "INVALID_STUDENTS", "All students must belong to this school and fee structure class");
            }
            const totalNgn = structure.items.reduce((sum, item) => sum + item.amountNgn, 0);
            if (!Number.isSafeInteger(totalNgn) || totalNgn <= 0 || totalNgn > 2147483647) {
                throw new errors_1.AppError(400, "INVALID_AMOUNT", "Fee total must be between 1 and 2147483647 NGN");
            }
            const batch = await tx.invoiceBatch.create({ data: { organizationId, idempotencyKey: input.idempotencyKey, requestHash } });
            const counters = await tx.$queryRaw `
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
    async listInvoices(organizationId, query) {
        const where = { organizationId };
        if (query.studentId)
            where.studentId = query.studentId;
        if (query.termId)
            where.termId = query.termId;
        if (query.status)
            where.status = query.status;
        if (query.outstandingOnly)
            where.outstandingNgn = { gt: 0 };
        if (query.paymentState && query.paymentState !== 'all') {
            where.status = { notIn: ['CANCELLED', 'DRAFT'] };
            if (query.paymentState === 'paid')
                where.outstandingNgn = 0;
            else {
                where.outstandingNgn = { gt: 0 };
                if (query.paymentState === 'unpaid')
                    where.paidNgn = 0;
                if (query.paymentState === 'partial')
                    where.paidNgn = { gt: 0 };
            }
        }
        if (query.search) {
            const contains = { contains: query.search, mode: 'insensitive' };
            where.OR = [
                { invoiceNumber: contains },
                { student: { firstName: contains } },
                { student: { lastName: contains } },
                { student: { admissionNumber: contains } },
            ];
        }
        return prisma_1.prisma.invoice.findMany({
            where,
            take: query.limit ?? 50,
            skip: query.offset ?? 0,
            orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
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
    async getInvoice(organizationId, id) {
        const inv = await prisma_1.prisma.invoice.findFirst({
            where: { id, organizationId },
            include: {
                student: true,
                items: { include: { feeCategory: true } },
                allocations: { include: { payment: true } },
                receipts: true,
                term: true,
            },
        });
        if (!inv)
            throw new errors_1.AppError(404, "NOT_FOUND", "Invoice not found");
        return inv;
    }
    // ─── Manual Payments + Allocation ──────────────────────────────
    async correctInvoice(organizationId, id, input, actorId, requestId) {
        input = fees_validation_1.correctInvoiceSchema.parse(input);
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const invoice = await tx.invoice.findFirst({ where: { id, organizationId }, include: { items: true, allocations: true, receipts: true } });
            if (!invoice)
                throw new errors_1.AppError(404, "NOT_FOUND", "Invoice not found");
            if (invoice.status === "CANCELLED" || invoice.paidNgn !== 0 || invoice.allocations.length || invoice.receipts.length) {
                throw new errors_1.AppError(409, "INVOICE_LOCKED", "Only unpaid invoices without payment history can be corrected");
            }
            let totalNgn = invoice.totalNgn;
            if (input.items) {
                totalNgn = input.items.reduce((sum, item) => sum + item.amountNgn, 0);
                if (!Number.isSafeInteger(totalNgn) || totalNgn <= 0 || totalNgn > 2147483647)
                    throw new errors_1.AppError(400, "INVALID_AMOUNT", "Invoice total must fit a positive integer NGN amount");
                const categories = await tx.feeCategory.findMany({ where: { organizationId, isActive: true,
                        id: { in: [...new Set(input.items.map(item => item.feeCategoryId))] } } });
                if (categories.length !== input.items.length)
                    throw new errors_1.AppError(400, "INVALID_CATEGORIES", "Use distinct active school categories");
                await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
                await tx.invoiceItem.createMany({ data: input.items.map(item => ({ ...item, invoiceId: id,
                        description: categories.find(category => category.id === item.feeCategoryId).name })) });
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
    async getPayment(organizationId, id) {
        const payment = await prisma_1.prisma.payment.findFirst({ where: { organizationId, id },
            include: { allocations: { include: { invoice: true } }, receipts: true } });
        if (!payment)
            throw new errors_1.AppError(404, "NOT_FOUND", "Payment not found");
        return payment;
    }
    async reverseManualPayment(organizationId, id, reason, actorId, requestId) {
        reason = fees_validation_1.reversePaymentSchema.parse({ reason }).reason;
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const payment = await tx.payment.findFirst({ where: { id, organizationId },
                include: { allocations: { include: { invoice: { select: { organizationId: true } } } }, receipts: true } });
            if (!payment)
                throw new errors_1.AppError(404, "NOT_FOUND", "Payment not found");
            if (payment.source !== "MANUAL")
                throw new errors_1.AppError(409, "MANUAL_PAYMENT_REQUIRED", "Provider payments need a provider refund workflow");
            if (payment.status === "REVERSED") {
                if (payment.reversalReason !== reason)
                    throw new errors_1.AppError(409, "REVERSAL_CONFLICT", "Payment was already reversed with another reason");
                return payment;
            }
            if (payment.status !== "SUCCESSFUL")
                throw new errors_1.AppError(409, "INVALID_STATUS", "Only successful manual payments can be reversed");
            if (payment.allocations.some(allocation => allocation.invoice.organizationId !== organizationId) ||
                payment.receipts.some(receipt => receipt.organizationId !== organizationId)) {
                throw new errors_1.AppError(409, "INVALID_PAYMENT_HISTORY", "Payment history requires reconciliation before reversal");
            }
            const reversedAt = new Date();
            await tx.payment.update({ where: { id }, data: { status: "REVERSED", reversedAt, reversalReason: reason } });
            await tx.paymentAllocation.updateMany({ where: { paymentId: id, reversedAt: null }, data: { reversedAt } });
            await tx.receipt.updateMany({ where: { paymentId: id, organizationId, voidedAt: null }, data: { voidedAt: reversedAt } });
            await tx.notificationOutbox.updateMany({ where: { organizationId, entityType: "Receipt", entityId: { in: payment.receipts.map(receipt => receipt.id) }, status: "PENDING" },
                data: { status: "CANCELLED", lockedAt: null, error: "PAYMENT_REVERSED" } });
            for (const invoiceId of new Set(payment.allocations.map(allocation => allocation.invoiceId)))
                await recalculateInvoice(tx, invoiceId);
            await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", organizationId, actorId, entity: "Payment", entityId: id,
                    requestId, metadata: { operation: "MANUAL_PAYMENT_REVERSED", reason, amountNgn: payment.amountNgn,
                        allocationIds: payment.allocations.map(allocation => allocation.id), receiptIds: payment.receipts.map(receipt => receipt.id) } } });
            return tx.payment.findUniqueOrThrow({ where: { id }, include: { allocations: true, receipts: true } });
        });
    }
    async createManualPayment(organizationId, input, recordedById, meta, transaction) {
        input = fees_validation_1.createManualPaymentSchema.parse(input);
        const requestHash = (0, crypto_1.createHash)("sha256").update(JSON.stringify({
            ...(input.studentId ? { studentId: input.studentId } : {}),
            amountNgn: input.amountNgn, method: input.method, note: input.note ?? null,
            paidAt: input.paidAt ? new Date(input.paidAt).toISOString() : null,
            allocations: [...(input.allocations ?? [])].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId) || a.amountNgn - b.amountNgn),
        })).digest("hex");
        const save = async (tx) => {
            const previous = await tx.payment.findUnique({ where: {
                    organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey }
                },
                include: { allocations: { include: { invoice: true } }, receipts: true } });
            if (previous) {
                if (previous.requestHash !== requestHash)
                    throw new errors_1.AppError(409, "IDEMPOTENCY_CONFLICT", "This key was used with a different payment request");
                return { ...previous, replayed: true };
            }
            if (input.studentId) {
                const student = await tx.student.findFirst({ where: { id: input.studentId, organizationId }, select: { id: true } });
                if (!student)
                    throw new errors_1.AppError(404, "STUDENT_NOT_FOUND", "Student not found");
                if (input.allocations?.length) {
                    const count = await tx.invoice.count({ where: { id: { in: [...new Set(input.allocations.map(a => a.invoiceId))] }, organizationId, studentId: input.studentId } });
                    if (count !== new Set(input.allocations.map(a => a.invoiceId)).size)
                        throw new errors_1.AppError(400, "INVALID_INVOICES", "All bills must belong to this student");
                }
            }
            const payment = await tx.payment.create({ data: { organizationId, amountNgn: input.amountNgn,
                    method: input.method, source: "MANUAL", status: "SUCCESSFUL", recordedById,
                    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), note: input.note,
                    idempotencyKey: input.idempotencyKey, requestHash, ...(input.studentId ? { providerPayload: { studentId: input.studentId } } : {}) } });
            if (input.allocations?.length)
                await this._allocateInTx(tx, organizationId, payment.id, payment.amountNgn, input.allocations);
            await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", actorId: recordedById, organizationId,
                    entity: "Payment", entityId: payment.id, requestId: meta?.requestId,
                    metadata: { amountNgn: payment.amountNgn, method: payment.method } } });
            const result = await tx.payment.findUniqueOrThrow({ where: { id: payment.id },
                include: { allocations: { include: { invoice: true } }, receipts: true } });
            return { ...result, replayed: false };
        };
        return transaction ? save(transaction) : (0, schoolTransaction_1.schoolTransaction)(organizationId, save);
    }
    async recordStudentPayment(organizationId, raw, actorId) {
        const input = financeWorkspace_1.studentPaymentSchema.parse(raw);
        let remaining = input.amountNgn;
        const allocations = input.bills.flatMap(bill => { const amountNgn = Math.min(remaining, bill.balanceNgn); remaining -= amountNgn; return amountNgn > 0 ? [{ invoiceId: bill.invoiceId, amountNgn }] : []; });
        if (remaining > 0)
            throw new errors_1.AppError(400, "OVER_OUTSTANDING", "The amount exceeds the selected bills. Refresh and check the student's balance.");
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const membership = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } } });
            if (!membership || !(0, rbac_1.permissionsForOrgRole)(membership.role).includes('payments:write'))
                throw new errors_1.AppError(403, 'FORBIDDEN', 'Current payment recording permission is required');
            const previous = await tx.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
            if (!previous) {
                const term = await tx.term.findFirst({ where: { id: input.termId, session: { organizationId } }, select: { id: true } });
                if (!term)
                    throw new errors_1.AppError(404, "TERM_NOT_FOUND", "Term not found");
                const bills = await tx.invoice.findMany({ where: { organizationId, studentId: input.studentId, termId: input.termId, id: { in: input.bills.map(b => b.invoiceId) }, status: { notIn: ['DRAFT', 'CANCELLED'] } }, select: { id: true, outstandingNgn: true } });
                if (bills.length !== input.bills.length || input.bills.some(saved => bills.find(b => b.id === saved.invoiceId)?.outstandingNgn !== saved.balanceNgn))
                    throw new errors_1.AppError(409, "BALANCE_CHANGED", "These bills changed after this entry was saved. No payment was recorded. Refresh the student and review the amount before saving a new entry.");
            }
            return this.createManualPayment(organizationId, { idempotencyKey: input.idempotencyKey, studentId: input.studentId, amountNgn: input.amountNgn, method: input.method, note: input.note, paidAt: input.paidAt, source: 'MANUAL', allocations }, actorId, undefined, tx);
        });
    }
    async allocatePayment(organizationId, paymentId, allocations, actorId, meta) {
        const payment = await prisma_1.prisma.payment.findFirst({
            where: { id: paymentId, organizationId },
        });
        if (!payment)
            throw new errors_1.AppError(404, "NOT_FOUND", "Payment not found");
        if (payment.status !== "SUCCESSFUL") {
            throw new errors_1.AppError(400, "INVALID_STATUS", "Only successful payments can be allocated");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const result = await this._allocateInTx(tx, organizationId, paymentId, payment.amountNgn, allocations);
            await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", actorId, organizationId,
                    entity: "PaymentAllocation", entityId: paymentId, requestId: meta?.requestId,
                    metadata: { operation: "PAYMENT_ALLOCATED", allocationIds: result.map(row => row.id) } } });
            return result;
        });
    }
    async _allocateInTx(tx, organizationId, paymentId, paymentAmount, allocations) {
        // Recheck after acquiring the school lock: a reversal may have committed
        // while an allocation caller was waiting for the lock.
        const current = await tx.payment.findFirst({ where: { id: paymentId, organizationId } });
        if (!current)
            throw new errors_1.AppError(404, "NOT_FOUND", "Payment not found");
        if (current.status !== "SUCCESSFUL")
            throw new errors_1.AppError(409, "INVALID_STATUS", "Only successful payments can be allocated");
        paymentAmount = current.amountNgn;
        // Existing active allocations for this payment
        const existing = await tx.paymentAllocation.findMany({
            where: { paymentId, reversedAt: null },
        });
        const alreadyAllocated = existing.reduce((s, a) => s + a.amountNgn, 0);
        const remainingPayment = paymentAmount - alreadyAllocated;
        const totalNew = allocations.reduce((s, a) => s + a.amountNgn, 0);
        if (totalNew > remainingPayment) {
            throw new errors_1.AppError(400, "OVER_ALLOCATION", `Cannot allocate ${totalNew}; only ${remainingPayment} remaining on payment`);
        }
        const created = [];
        for (const alloc of allocations) {
            if (!Number.isSafeInteger(alloc.amountNgn) || alloc.amountNgn <= 0) {
                throw new errors_1.AppError(400, "INVALID_AMOUNT", "Allocation must be a positive whole naira amount");
            }
            const invoice = await tx.invoice.findFirst({
                where: { id: alloc.invoiceId, organizationId },
                include: { items: true, allocations: { where: { reversedAt: null, payment: { status: "SUCCESSFUL" } } } },
            });
            if (!invoice) {
                throw new errors_1.AppError(404, "INVOICE_NOT_FOUND", `Invoice ${alloc.invoiceId} not found`);
            }
            const paymentStudentId = current.providerPayload?.studentId;
            if (typeof paymentStudentId === 'string' && invoice.studentId !== paymentStudentId) {
                throw new errors_1.AppError(400, 'INVALID_INVOICES', 'A student payment can only cover that student’s bills');
            }
            if (invoice.status === "CANCELLED")
                throw new errors_1.AppError(400, "CANCELLED_INVOICE", "Cannot allocate to a cancelled invoice");
            if (alloc.amountNgn > invoice.outstandingNgn) {
                throw new errors_1.AppError(400, "OVER_OUTSTANDING", `Allocation ${alloc.amountNgn} exceeds invoice outstanding ${invoice.outstandingNgn}`);
            }
            const itemAllocations = (0, itemBalances_1.allocateItems)(invoice, alloc.amountNgn, alloc.itemSelection);
            const row = await tx.paymentAllocation.create({
                data: {
                    paymentId,
                    invoiceId: alloc.invoiceId,
                    amountNgn: alloc.amountNgn,
                    itemAllocations,
                },
            });
            created.push(row);
            await recalculateInvoice(tx, alloc.invoiceId);
            // Auto-issue receipt for this allocation (simple V1 rule)
            const counters = await tx.$queryRaw `
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
                    items: itemAllocations,
                },
            });
            await (0, studentNotifications_1.enqueueReceipt)(tx, organizationId, receipt, invoice.studentId);
        }
        return created;
    }
    // ─── Receipts ──────────────────────────────────────────────────
    async getReceipt(organizationId, id) {
        const r = await prisma_1.prisma.receipt.findFirst({
            where: { id, organizationId },
            include: {
                payment: true,
                invoice: { include: { student: true, items: true } },
            },
        });
        if (!r)
            throw new errors_1.AppError(404, "NOT_FOUND", "Receipt not found");
        return r;
    }
    async listReceipts(organizationId, paymentId) {
        return prisma_1.prisma.receipt.findMany({
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
    async parentFees(organizationId, parentUserId) {
        const parent = await prisma_1.prisma.parent.findFirst({
            where: { organizationId, userId: parentUserId, isActive: true },
            select: { id: true },
        });
        if (!parent)
            throw new errors_1.AppError(403, "NOT_A_PARENT", "No parent profile");
        const links = await prisma_1.prisma.parentStudent.findMany({
            where: { parentId: parent.id, organizationId, student: { organizationId } },
            select: { studentId: true },
        });
        const studentIds = links.map((l) => l.studentId);
        if (studentIds.length === 0)
            return { children: [] };
        const invoices = await prisma_1.prisma.invoice.findMany({
            where: { organizationId, studentId: { in: studentIds }, status: { not: "DRAFT" } },
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
                term: { include: { session: true } },
                allocations: { where: { reversedAt: null, payment: { status: "SUCCESSFUL" } } },
                receipts: true,
            },
            orderBy: { issuedAt: "desc" },
        });
        const creditReceipts = await prisma_1.prisma.receipt.findMany({ where: { organizationId, invoiceId: null, payment: { recordedById: parentUserId, source: 'PAYSTACK', OR: studentIds.map(id => ({ providerPayload: { path: ['studentId'], equals: id } })) } }, select: { id: true, receiptNumber: true, amountNgn: true, issuedAt: true, voidedAt: true, payment: { select: { providerPayload: true } } } });
        return { invoices: invoices.map(({ allocations, ...invoice }) => ({ ...invoice, items: (0, itemBalances_1.itemBalances)({ ...invoice, allocations }) })), creditReceipts: creditReceipts.map(({ payment, ...receipt }) => ({ ...receipt, studentId: payment.providerPayload?.studentId })), onlinePaymentsEnabled: !!(0, paymentConfig_1.parentPaymentSubaccount)(organizationId), bankAccount: await (0, bankAccount_1.bankTransferInstructions)(organizationId) };
    }
    // ─── Bursar summary ────────────────────────────────────────────
    async bursarSummary(organizationId, opts) {
        if (opts?.termId) {
            const where = { organizationId, termId: opts.termId, status: { notIn: ['CANCELLED', 'DRAFT'] } };
            const [totals, invoiceCount] = await Promise.all([
                prisma_1.prisma.invoice.aggregate({ where, _sum: { totalNgn: true, paidNgn: true, outstandingNgn: true } }),
                prisma_1.prisma.invoice.count({ where: { ...where, outstandingNgn: { gt: 0 } } }),
            ]);
            return { collectedNgn: totals._sum.paidNgn ?? 0, outstandingNgn: totals._sum.outstandingNgn ?? 0,
                billedNgn: totals._sum.totalNgn ?? 0, invoicesWithBalance: invoiceCount };
        }
        const paymentWhere = {
            organizationId,
            status: "SUCCESSFUL",
        };
        if (opts?.from || opts?.to) {
            paymentWhere.paidAt = {};
            if (opts.from)
                paymentWhere.paidAt.gte = new Date(opts.from);
            if (opts.to)
                paymentWhere.paidAt.lte = new Date(opts.to);
        }
        const [collected, outstanding, invoiceCount] = await Promise.all([
            prisma_1.prisma.payment.aggregate({
                where: paymentWhere,
                _sum: { amountNgn: true },
            }),
            prisma_1.prisma.invoice.aggregate({
                where: {
                    organizationId,
                    outstandingNgn: { gt: 0 },
                    status: { not: "CANCELLED" },
                },
                _sum: { outstandingNgn: true },
            }),
            prisma_1.prisma.invoice.count({
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
    async initializeOnlinePayment(organizationId, input, recordedById, meta) {
        if (!Number.isSafeInteger(input.amountNgn) || input.amountNgn <= 0 || !Number.isSafeInteger(input.amountNgn * 100)) {
            throw new errors_1.AppError(400, "INVALID_AMOUNT", "Payment amount must be a positive whole naira amount");
        }
        if (input.studentId && !await prisma_1.prisma.student.findFirst({ where: { id: input.studentId, organizationId, isActive: true } })) {
            throw new errors_1.AppError(400, "INVALID_STUDENT", "Student must belong to this school");
        }
        // Validate invoices belong to school and still have outstanding
        if (input.invoiceIds?.length) {
            const invoices = await prisma_1.prisma.invoice.findMany({
                where: {
                    id: { in: input.invoiceIds },
                    organizationId,
                    outstandingNgn: { gt: 0 },
                    status: { not: "CANCELLED" },
                    ...(input.studentId ? { studentId: input.studentId } : {}),
                },
            });
            if (invoices.length !== input.invoiceIds.length) {
                throw new errors_1.AppError(400, "INVALID_INVOICES", "One or more invoices are invalid or fully paid");
            }
        }
        const reference = `sch_${organizationId.slice(0, 8)}_${(0, crypto_1.randomBytes)(8).toString("hex")}`;
        const payment = await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (input.idempotencyKey) {
                const previous = await tx.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
                if (previous) {
                    if (previous.recordedById !== recordedById || previous.providerPayload?.selectionHash !== input.metadata?.selectionHash)
                        throw new errors_1.AppError(409, "IDEMPOTENCY_CONFLICT", "Payment selection changed");
                    return previous;
                }
            }
            return tx.payment.create({
                data: {
                    organizationId,
                    idempotencyKey: input.idempotencyKey,
                    amountNgn: input.amountNgn,
                    status: "PENDING",
                    method: "ONLINE",
                    source: "PAYSTACK",
                    providerReference: reference,
                    recordedById,
                    note: input.studentId ? `Student ${input.studentId}` : undefined,
                    providerPayload: {
                        ...input.metadata,
                        subaccount: input.subaccount,
                        invoiceIds: input.invoiceIds ?? [],
                        studentId: input.studentId,
                    },
                },
            });
        });
        const previousCheckout = payment.providerPayload?.checkout;
        if (previousCheckout)
            return { paymentId: payment.id, reference: payment.providerReference, authorizationUrl: previousCheckout.authorization_url, accessCode: previousCheckout.access_code };
        const amountKobo = payment.amountNgn * 100;
        const paystack = await (0, paystack_1.initializeTransaction)({
            email: input.email,
            amountKobo,
            reference: payment.providerReference,
            subaccount: payment.providerPayload?.subaccount ?? input.subaccount,
            callback_url: input.callbackUrl || `${process.env.APP_URL}/payments/callback`,
            metadata: {
                organizationId,
                paymentId: payment.id,
                invoiceIds: payment.providerPayload?.invoiceIds,
                studentId: payment.providerPayload?.studentId,
                custom_fields: [
                    {
                        display_name: "Payment ID",
                        variable_name: "payment_id",
                        value: payment.id,
                    },
                ],
            },
        });
        await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => { const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }); await tx.payment.update({ where: { id: payment.id }, data: { providerPayload: { ...current.providerPayload, checkout: paystack } } }); });
        await audit_service_1.auditService.write({
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
            reference: payment.providerReference,
            authorizationUrl: paystack.authorization_url,
            accessCode: paystack.access_code,
        };
    }
    /**
     * Called only from the webhook (or a manual verify endpoint for recovery).
     * Idempotent by providerReference.
     */
    async handlePaystackWebhook(rawBody, signature, meta) {
        if (!(0, paystack_1.verifyPaystackSignature)(rawBody, signature)) {
            throw new errors_1.AppError(401, "INVALID_SIGNATURE", "Invalid Paystack signature");
        }
        const event = typeof rawBody === "string"
            ? JSON.parse(rawBody)
            : JSON.parse(rawBody.toString());
        const { event: eventType, data } = event;
        // We only care about successful charges for now
        if (eventType !== "charge.success") {
            return { ignored: true, event: eventType };
        }
        const reference = data.reference;
        return this.finalizePaystackPayment(reference, data, meta);
    }
    async finalizePaystackPayment(reference, rawData, meta) {
        // 1. Find our pending payment
        const payment = await prisma_1.prisma.payment.findFirst({
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
        const verified = await (0, paystack_1.verifyTransaction)(reference);
        if (verified.status !== "success") {
            if (verified.status === "pending" || verified.status === "ongoing" || verified.status === "processing" || verified.status === "queued") {
                return { status: "pending", paymentId: payment.id };
            }
            await prisma_1.prisma.payment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: {
                    status: "FAILED",
                    providerPayload: { ...payment.providerPayload, verified },
                },
            });
            return { status: "failed", paymentId: payment.id };
        }
        // Amount check (kobo → naira)
        if (verified.amount !== payment.amountNgn * 100 || verified.currency !== "NGN" || verified.reference !== reference) {
            throw new errors_1.AppError(409, "PAYMENT_MISMATCH", "Verified amount, currency or reference does not match this payment");
        }
        // 3. Mark successful + allocate inside one transaction
        const result = await (0, schoolTransaction_1.schoolTransaction)(payment.organizationId, async (tx) => {
            const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
            if (current.status === "SUCCESSFUL")
                return current;
            if (current.status === "REFUNDED" || current.status === "REVERSED") {
                throw new errors_1.AppError(409, "PAYMENT_CLOSED", "A closed payment cannot be credited again");
            }
            const updated = await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: "SUCCESSFUL",
                    paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
                    providerPayload: {
                        ...payment.providerPayload,
                        verified,
                        webhook: rawData,
                    },
                },
            });
            // Auto-allocate if invoiceIds were stored at initialize time
            const payload = payment.providerPayload;
            const invoiceIds = payload?.invoiceIds || [];
            if (invoiceIds.length > 0) {
                // Simple FIFO allocation across the supplied invoices
                let remaining = updated.amountNgn;
                const allocations = [];
                for (const invId of invoiceIds) {
                    if (remaining <= 0)
                        break;
                    const inv = await tx.invoice.findFirst({
                        where: { id: invId, organizationId: payment.organizationId },
                        include: { items: true, allocations: { where: { reversedAt: null, payment: { status: "SUCCESSFUL" } } } },
                    });
                    if (!inv || inv.status === "CANCELLED" || inv.outstandingNgn <= 0)
                        continue;
                    const selection = payload?.itemSelections?.[invId];
                    const balances = (0, itemBalances_1.itemBalances)(inv);
                    const selectedRemaining = selection ? selection.reduce((sum, line) => sum + Math.min(line.amountNgn, balances.find(item => item.id === line.invoiceItemId)?.outstandingNgn ?? 0), 0) : inv.outstandingNgn;
                    const allocAmount = Math.min(remaining, inv.outstandingNgn, selectedRemaining);
                    if (allocAmount <= 0)
                        continue;
                    allocations.push({ invoiceId: invId, amountNgn: allocAmount, itemSelection: selection?.filter(line => balances.some(item => item.id === line.invoiceItemId)) });
                    remaining -= allocAmount;
                }
                if (remaining > 0 && payload?.parentUserId) {
                    await tx.receipt.create({ data: { organizationId: payment.organizationId, paymentId: payment.id, receiptNumber: 'CREDIT-' + payment.id, amountNgn: remaining, items: [{ invoiceItemId: 'credit', description: 'Unallocated school credit — contact the school office', amountNgn: remaining }] } });
                }
                if (allocations.length) {
                    await this._allocateInTx(tx, payment.organizationId, payment.id, updated.amountNgn, allocations);
                }
            }
            await tx.auditLog.create({ data: { action: "PAYMENT_CREATED", organizationId: payment.organizationId,
                    entity: "Payment", entityId: payment.id, metadata: { source: "PAYSTACK", reference, status: "SUCCESSFUL" }, requestId: meta?.requestId } });
            return updated;
        });
        return { status: "success", paymentId: result.id };
    }
    /** Optional recovery endpoint for staff */
    async verifyAndFinalize(organizationId, reference, actorId) {
        const payment = await prisma_1.prisma.payment.findFirst({
            where: { organizationId, providerReference: reference },
        });
        if (!payment)
            throw new errors_1.AppError(404, "NOT_FOUND", "Payment not found");
        return this.finalizePaystackPayment(reference, undefined, {
            requestId: undefined,
        });
    }
}
exports.FeesService = FeesService;
exports.feesService = new FeesService();
