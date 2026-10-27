"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentCheckoutSchema = exports.parentPaymentSubaccount = void 0;
exports.startParentCheckout = startParentCheckout;
exports.parentPaymentStatus = parentPaymentStatus;
exports.parentReceipt = parentReceipt;
const paymentConfig_1 = require("./paymentConfig");
var paymentConfig_2 = require("./paymentConfig");
Object.defineProperty(exports, "parentPaymentSubaccount", { enumerable: true, get: function () { return paymentConfig_2.parentPaymentSubaccount; } });
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
const fees_service_1 = require("./fees.service");
const itemBalances_1 = require("./itemBalances");
exports.parentCheckoutSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(), idempotencyKey: zod_1.z.string().uuid(),
    itemIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(300),
    callbackOrigin: zod_1.z.string().url(),
}).strict().refine(input => new Set(input.itemIds).size === input.itemIds.length, 'Select each item only once');
async function startParentCheckout(auth, body) {
    const input = exports.parentCheckoutSchema.parse(body), organizationId = auth.schoolId;
    if (auth.orgRole !== 'PARENT')
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Parent access required');
    await (0, resourceAccess_1.assertParentChildAccess)(auth, input.studentId);
    const subaccount = (0, paymentConfig_1.parentPaymentSubaccount)(organizationId);
    if (!subaccount)
        throw new errors_1.AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payment is not configured for this school. Use the school bank details or contact the office.');
    const origin = new URL(input.callbackOrigin).origin;
    const allowed = [process.env.WEB_URL, ...(process.env.CORS_ORIGINS || '').split(',')].filter(Boolean).map(value => {
        try {
            return new URL(value.trim()).origin;
        }
        catch {
            return '';
        }
    });
    if (input.callbackOrigin !== origin || !allowed.includes(origin))
        throw new errors_1.AppError(400, 'INVALID_CALLBACK', 'Return address is not allowed');
    const user = await prisma_1.prisma.user.findFirst({ where: { id: auth.userId, isActive: true }, select: { email: true } });
    if (!user)
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Active account required');
    // Retry the original request even when a webhook has already changed the balances.
    const selectionHash = JSON.stringify({ studentId: input.studentId, itemIds: [...input.itemIds].sort() });
    const previous = await prisma_1.prisma.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } } });
    if (previous) {
        const payload = previous.providerPayload;
        if (previous.recordedById !== auth.userId || payload?.selectionHash !== selectionHash)
            throw new errors_1.AppError(409, 'IDEMPOTENCY_CONFLICT', 'This payment attempt belongs to another selection');
        if (previous.status === 'PENDING' && !payload?.checkout) {
            // A provider/network failure must not strand the original attempt or create a new charge reference.
            return fees_service_1.feesService.initializeOnlinePayment(organizationId, {
                amountNgn: previous.amountNgn, email: user.email, idempotencyKey: input.idempotencyKey,
                callbackUrl: origin + '/parent', subaccount: payload?.subaccount ?? subaccount, metadata: payload,
            }, auth.userId);
        }
        return { reference: previous.providerReference, authorizationUrl: previous.status === 'PENDING' ? payload?.checkout?.authorization_url : undefined, paymentId: previous.id };
    }
    const invoices = await prisma_1.prisma.invoice.findMany({
        where: { organizationId, studentId: input.studentId, status: { notIn: ['CANCELLED', 'DRAFT'] }, outstandingNgn: { gt: 0 }, items: { some: { id: { in: input.itemIds } } } },
        include: { items: true, allocations: { where: { reversedAt: null, payment: { status: 'SUCCESSFUL' } } } },
    });
    const selected = invoices.flatMap(invoice => (0, itemBalances_1.itemBalances)(invoice).filter(item => input.itemIds.includes(item.id)));
    if (selected.length !== input.itemIds.length || selected.some(item => item.outstandingNgn <= 0))
        throw new errors_1.AppError(409, 'BILLS_CHANGED', 'Some selected items have been paid or changed. Refresh the bills.');
    const itemSelections = {};
    for (const invoice of invoices)
        itemSelections[invoice.id] = (0, itemBalances_1.itemBalances)(invoice).filter(item => input.itemIds.includes(item.id)).map(item => ({ invoiceItemId: item.id, description: item.description, amountNgn: item.outstandingNgn }));
    const amountNgn = selected.reduce((sum, item) => sum + item.outstandingNgn, 0);
    if (!Number.isSafeInteger(amountNgn) || amountNgn > 2147483647)
        throw new errors_1.AppError(400, 'INVALID_AMOUNT', 'Select fewer items for one payment');
    return fees_service_1.feesService.initializeOnlinePayment(organizationId, {
        amountNgn, email: user.email,
        studentId: input.studentId, invoiceIds: invoices.map(invoice => invoice.id),
        callbackUrl: origin + '/parent', subaccount, idempotencyKey: input.idempotencyKey,
        metadata: { itemSelections, selectionHash, parentUserId: auth.userId },
    }, auth.userId);
}
async function parentPaymentStatus(auth, reference) {
    if (auth.orgRole !== 'PARENT')
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Parent access required');
    const payment = await prisma_1.prisma.payment.findFirst({ where: { organizationId: auth.schoolId, source: 'PAYSTACK', providerReference: reference, recordedById: auth.userId } });
    const studentId = payment?.providerPayload?.studentId;
    if (!payment || typeof studentId !== 'string')
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Payment not found');
    await (0, resourceAccess_1.assertParentChildAccess)(auth, studentId);
    const result = await fees_service_1.feesService.verifyAndFinalize(auth.schoolId, reference, auth.userId);
    return { ...result, studentId, reference };
}
async function parentReceipt(auth, id) {
    if (auth.orgRole !== 'PARENT')
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Parent access required');
    const receipt = await prisma_1.prisma.receipt.findFirst({ where: { id, organizationId: auth.schoolId }, include: { payment: true, invoice: { include: { student: true, items: true, term: { include: { session: true } } } }, organization: { select: { name: true } } } });
    const studentId = receipt?.invoice?.studentId ?? receipt?.payment.providerPayload?.studentId;
    if (!receipt || !studentId)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Receipt not found');
    await (0, resourceAccess_1.assertParentChildAccess)(auth, studentId);
    const student = receipt.invoice?.student ?? await prisma_1.prisma.student.findFirst({ where: { id: studentId, organizationId: auth.schoolId } });
    return { id: receipt.id, receiptNumber: receipt.receiptNumber, amountNgn: receipt.amountNgn, issuedAt: receipt.issuedAt, voidedAt: receipt.voidedAt,
        items: receipt.items, schoolName: receipt.organization.name,
        student: student && { firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber },
        payment: { method: receipt.payment.method, reference: receipt.payment.providerReference ?? receipt.payment.id, status: receipt.payment.status },
        invoice: receipt.invoice && { invoiceNumber: receipt.invoice.invoiceNumber, outstandingNgn: receipt.invoice.outstandingNgn, term: receipt.invoice.term },
    };
}
