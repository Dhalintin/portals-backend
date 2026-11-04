"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolOwner = exports.manager = exports.STUDENT_TERM_PRICE = void 0;
exports.amounts = amounts;
exports.ensureInvoice = ensureInvoice;
exports.evaluateAccess = evaluateAccess;
exports.billingAccess = billingAccess;
exports.billingWorkspace = billingWorkspace;
exports.changeSponsorship = changeSponsorship;
exports.familyBilling = familyBilling;
exports.startBillingPayment = startBillingPayment;
exports.verifyBillingPayment = verifyBillingPayment;
exports.reviewBillingPayment = reviewBillingPayment;
exports.applyBillingCredit = applyBillingCredit;
exports.quoteAnnual = quoteAnnual;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
const paystack_1 = require("../../lib/paystack");
const env_1 = require("../../config/env");
exports.STUDENT_TERM_PRICE = 300;
const DAY = 86400000;
const invoiceInclude = { seats: true, allocations: { where: { payment: { status: 'CONFIRMED' } } }, term: { include: { session: true } } };
const money = zod_1.z.number().int().positive().max(300000000);
const hash = (value) => (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex');
const manager = (auth) => auth.permissions.includes('payments:write');
exports.manager = manager;
const schoolOwner = (auth) => auth.orgRole === 'PROPRIETOR' || auth.orgRoles?.includes('PROPRIETOR');
exports.schoolOwner = schoolOwner;
function amounts(invoice) { const totalNgn = invoice.seats.length * invoice.unitPriceNgn, paidNgn = invoice.allocations.reduce((n, a) => n + a.amountNgn, 0); return { totalNgn, paidNgn, outstandingNgn: Math.max(0, totalNgn - paidNgn), students: invoice.seats.length, firstInstalmentNgn: Math.ceil(totalNgn / 2) }; }
async function settings(tx, organizationId) { return tx.subscription.upsert({ where: { organizationId }, create: { organizationId, plan: 'STARTER', studentCap: 1000000, status: 'TRIAL' }, update: {} }); }
async function ensureInvoice(tx, organizationId, termId) {
    const sub = await settings(tx, organizationId);
    const term = await tx.term.findFirst({ where: { ...(termId ? { id: termId } : { isCurrent: true }), session: { organizationId, ...(!termId ? { isCurrent: true } : {}) } }, include: { session: true } });
    if (!term || !term.startDate || !term.endDate)
        return null;
    // No retrospective invoices for terms already closed when billing was introduced.
    if (term.endDate < sub.billingStartedAt && !await tx.termSubscription.findUnique({ where: { organizationId_termId: { organizationId, termId: term.id } } }))
        return null;
    let invoice = await tx.termSubscription.upsert({ where: { organizationId_termId: { organizationId, termId: term.id } }, create: { organizationId, termId: term.id, startDate: term.startDate, endDate: new Date(term.endDate.getTime() + DAY - 1), balanceDueAt: new Date(Math.max(term.startDate.getTime(), sub.billingStartedAt.getTime()) + 30 * DAY), sponsorship: sub.sponsorship, schoolSharePercent: sub.schoolSharePercent }, update: {}, include: invoiceInclude });
    if (invoice.endDate >= new Date()) {
        const students = await tx.student.findMany({ where: { organizationId, isActive: true }, select: { id: true, firstName: true, lastName: true, admissionNumber: true } });
        const existingSeats = new Set(invoice.seats.map(s => s.studentId));
        const added = students.filter(s => !existingSeats.has(s.id));
        if (added.length)
            await tx.subscriptionSeat.createMany({ data: added.map(s => ({ invoiceId: invoice.id, studentId: s.id, studentName: s.firstName + ' ' + s.lastName, admissionNumber: s.admissionNumber })), skipDuplicates: true });
        invoice = await tx.termSubscription.findUniqueOrThrow({ where: { id: invoice.id }, include: invoiceInclude });
    }
    return invoice;
}
function evaluateAccess(input) {
    const { now, invoice } = input;
    if (input.accessUntil && input.accessUntil >= now)
        return { status: 'EXTENDED', canWrite: true };
    if (now < input.trialEnds)
        return { status: 'TRIAL', canWrite: true };
    if (input.arrears)
        return { status: 'OVERDUE', canWrite: false };
    if (!invoice)
        return { status: 'SETUP_REQUIRED', canWrite: false };
    if (now > invoice.endDate)
        return { status: 'TERM_ENDED', canWrite: false };
    if (now < invoice.startDate)
        return { status: invoice.paidNgn >= Math.ceil(invoice.totalNgn / 2) ? 'PREPAID' : 'UPCOMING', canWrite: invoice.totalNgn > 0 && invoice.paidNgn >= Math.ceil(invoice.totalNgn / 2) };
    if (invoice.paidNgn >= invoice.totalNgn)
        return { status: 'PAID', canWrite: true };
    if (now <= invoice.balanceDueAt)
        return { status: invoice.paidNgn >= Math.ceil(invoice.totalNgn / 2) ? 'INSTALMENT' : 'GRACE', canWrite: true };
    return { status: 'OVERDUE', canWrite: false };
}
async function billingAccess(organizationId) {
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const sub = await settings(tx, organizationId), invoice = await ensureInvoice(tx, organizationId), now = new Date(), trialEnds = new Date(sub.billingStartedAt.getTime() + 30 * DAY);
        const all = await tx.termSubscription.findMany({ where: { organizationId, balanceDueAt: { lt: now } }, include: invoiceInclude });
        const arrears = all.some(i => amounts(i).outstandingNgn > 0);
        return { ...evaluateAccess({ now, trialEnds, accessUntil: sub.accessUntil, invoice: invoice ? { ...invoice, ...amounts(invoice) } : null, arrears }), trialEnds, graceEnds: invoice?.balanceDueAt ?? trialEnds, termId: invoice?.termId ?? null, accessUntil: sub.accessUntil };
    });
}
function display(invoice) { return { id: invoice.id, termId: invoice.termId, term: invoice.term.name, session: invoice.term.session.name, sessionId: invoice.term.sessionId, startDate: invoice.startDate, endDate: invoice.endDate, balanceDueAt: invoice.balanceDueAt, unitPriceNgn: invoice.unitPriceNgn, annualPrepaid: invoice.annualPrepaid, sponsorship: invoice.sponsorship, schoolSharePercent: invoice.schoolSharePercent, ...amounts(invoice) }; }
async function billingWorkspace(organizationId) {
    const access = await billingAccess(organizationId);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const sub = await settings(tx, organizationId), invoices = await tx.termSubscription.findMany({ where: { organizationId }, include: invoiceInclude, orderBy: { startDate: 'desc' } }), payments = await tx.billingPayment.findMany({ where: { organizationId }, include: { allocations: true }, orderBy: { createdAt: 'desc' }, take: 100 }), bank = await tx.platformBillingSettings.findUnique({ where: { id: 'billing' } });
        const confirmed = await tx.billingPayment.aggregate({ where: { organizationId, status: 'CONFIRMED' }, _sum: { amountNgn: true } }), allocated = await tx.billingAllocation.aggregate({ where: { invoice: { organizationId }, payment: { status: 'CONFIRMED' } }, _sum: { amountNgn: true } });
        return { priceNgn: 300, access, sponsorship: sub.sponsorship, schoolSharePercent: sub.schoolSharePercent, paymentSchedule: sub.paymentSchedule, invoices: invoices.map(display), payments, creditNgn: (confirmed._sum.amountNgn ?? 0) - (allocated._sum.amountNgn ?? 0), bank, onlineEnabled: !!process.env.PAYSTACK_SECRET_KEY, annualDiscountPercent: 10 };
    });
}
async function changeSponsorship(auth, raw) {
    if (!(0, exports.schoolOwner)(auth))
        throw new errors_1.AppError(403, 'OWNER_ONLY', 'Only a school owner can choose the sponsorship arrangement.');
    const input = zod_1.z.object({ sponsorship: zod_1.z.enum(['SCHOOL', 'PARENT', 'SHARED']), schoolSharePercent: zod_1.z.number().int().min(0).max(100).default(50), paymentSchedule: zod_1.z.enum(['FULL', 'TWO_INSTALMENTS']) }).strict().parse(raw);
    const percentage = input.sponsorship === 'SCHOOL' ? 100 : input.sponsorship === 'PARENT' ? 0 : input.schoolSharePercent;
    return (0, schoolTransaction_1.schoolTransaction)(auth.schoolId, async (tx) => {
        const current = await ensureInvoice(tx, auth.schoolId);
        if (current && (amounts(current).paidNgn > 0 || await tx.billingPayment.count({ where: { invoiceId: current.id, status: 'PENDING' } })))
            throw new errors_1.AppError(409, 'BILLING_STARTED', 'Sponsorship is locked after a payment or pending transfer. Contact support to reconcile it first.');
        await tx.subscription.update({ where: { organizationId: auth.schoolId }, data: { sponsorship: input.sponsorship, schoolSharePercent: percentage, paymentSchedule: input.paymentSchedule } });
        if (current)
            await tx.termSubscription.update({ where: { id: current.id }, data: { sponsorship: input.sponsorship, schoolSharePercent: percentage } });
        await tx.auditLog.create({ data: { organizationId: auth.schoolId, actorId: auth.userId, action: 'SETTINGS_CHANGED', entity: 'Subscription', metadata: { operation: 'SPONSORSHIP_CHANGED', ...input, schoolSharePercent: percentage } } });
        return { ok: true };
    });
}
async function familyStudent(auth, studentId) {
    if (!['PARENT', 'STUDENT'].includes(auth.orgRole ?? ''))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Family account required');
    await (0, resourceAccess_1.assertParentChildAccess)(auth, studentId);
}
async function familyBilling(auth, studentId) {
    await familyStudent(auth, studentId);
    return (0, schoolTransaction_1.schoolTransaction)(auth.schoolId, async (tx) => {
        const invoice = await ensureInvoice(tx, auth.schoolId);
        if (!invoice)
            return null;
        const seat = invoice.seats.find(s => s.studentId === studentId);
        if (!seat)
            return null;
        const paid = await tx.billingPayment.aggregate({ where: { organizationId: auth.schoolId, invoiceId: invoice.id, studentId, status: 'CONFIRMED' }, _sum: { amountNgn: true } });
        const shareNgn = Math.round(invoice.unitPriceNgn * (100 - invoice.schoolSharePercent) / 100);
        return { invoiceId: invoice.id, term: invoice.term.name, session: invoice.term.session.name, shareNgn, paidNgn: paid._sum.amountNgn ?? 0, outstandingNgn: Math.min(Math.max(0, shareNgn - (paid._sum.amountNgn ?? 0)), amounts(invoice).outstandingNgn), schoolResponsible: true, receiptEmail: auth.orgRole === 'STUDENT' ? (await tx.student.findFirst({ where: { id: studentId, organizationId: auth.schoolId }, select: { contactEmail: true } }))?.contactEmail : null, payments: await tx.billingPayment.findMany({ where: { organizationId: auth.schoolId, invoiceId: invoice.id, studentId, actorId: auth.userId }, select: { id: true, reference: true, status: true, amountNgn: true, checkoutUrl: true, paidAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }) };
    });
}
async function annualInvoices(tx, organizationId, invoice) {
    const terms = await tx.term.findMany({ where: { sessionId: invoice.term.sessionId, session: { organizationId } }, orderBy: { startDate: 'asc' } });
    if (terms.length !== 3 || terms.some(t => !t.startDate || !t.endDate))
        throw new errors_1.AppError(400, 'ANNUAL_TERMS_REQUIRED', 'Set dates for all three terms before paying for the year.');
    const invoices = [];
    for (const term of terms) {
        const i = await ensureInvoice(tx, organizationId, term.id);
        if (!i)
            throw new errors_1.AppError(400, 'ANNUAL_UNAVAILABLE', 'Annual prepayment requires three available terms.');
        invoices.push(i);
    }
    if (invoices.some(i => amounts(i).paidNgn > 0 && !i.annualPrepaid))
        throw new errors_1.AppError(409, 'ANNUAL_ALREADY_STARTED', 'Annual discount is available only before paying for this school year.');
    return invoices;
}
async function startBillingPayment(auth, raw) {
    const input = zod_1.z.object({ invoiceId: zod_1.z.string().uuid(), amountNgn: money.optional(), studentId: zod_1.z.string().uuid().optional(), annual: zod_1.z.boolean().default(false), channel: zod_1.z.enum(['PAYSTACK', 'TRANSFER']), idempotencyKey: zod_1.z.string().uuid(), bankReference: zod_1.z.string().trim().min(4).max(120).optional(), note: zod_1.z.string().trim().max(500).optional(), callbackOrigin: zod_1.z.string().url().optional() }).strict().parse(raw);
    const org = auth.schoolId;
    if (input.studentId)
        await familyStudent(auth, input.studentId);
    else if (!(0, exports.manager)(auth))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'School accounts access required.');
    if (input.studentId && (input.channel !== 'PAYSTACK' || input.annual))
        throw new errors_1.AppError(400, 'INVALID_PAYMENT', 'Families can pay only their own term contribution online. Pay through the school for a bank transfer.');
    let origin;
    if (input.channel === 'PAYSTACK') {
        origin = input.callbackOrigin;
        if (!origin || !env_1.env.CORS_ORIGINS.split(',').map(x => x.trim()).includes(origin))
            throw new errors_1.AppError(400, 'INVALID_CALLBACK', 'Use the configured portal address.');
    }
    const requestHash = hash({ ...input, callbackOrigin: origin }), payment = await (0, schoolTransaction_1.schoolTransaction)(org, async (tx) => {
        const old = await tx.billingPayment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: org, idempotencyKey: input.idempotencyKey } } });
        if (old) {
            if (old.actorId !== auth.userId || old.requestHash !== requestHash)
                throw new errors_1.AppError(409, 'IDEMPOTENCY_CONFLICT', 'This saved attempt belongs to different payment details.');
            return old;
        }
        const known = await tx.termSubscription.findFirst({ where: { id: input.invoiceId, organizationId: org }, select: { termId: true } });
        if (!known)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Subscription bill not found');
        const invoice = await ensureInvoice(tx, org, known.termId);
        if (!invoice)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Subscription bill unavailable');
        const pendingYear = await tx.billingPayment.findFirst({ where: { organizationId: org, status: 'PENDING', invoice: { term: { sessionId: invoice.term.sessionId } }, ...(input.annual ? {} : { annual: true }) } });
        if (pendingYear)
            throw new errors_1.AppError(409, 'PAYMENT_PENDING', 'An annual or overlapping payment is awaiting confirmation for this school year. Resume or review it before starting another payment.');
        let available = amounts(invoice).outstandingNgn;
        if (input.annual) {
            const year = await annualInvoices(tx, org, invoice);
            available = year.reduce((n, i) => n + (i.annualPrepaid ? amounts(i).outstandingNgn : i.seats.length * 270), 0);
        }
        if (input.studentId) {
            const seat = invoice.seats.find(s => s.studentId === input.studentId);
            if (!seat)
                throw new errors_1.AppError(404, 'NOT_FOUND', 'Student not billed for this term');
            const p = await tx.billingPayment.aggregate({ where: { organizationId: org, invoiceId: invoice.id, studentId: input.studentId, status: 'CONFIRMED' }, _sum: { amountNgn: true } });
            available = Math.min(available, Math.max(0, Math.round(invoice.unitPriceNgn * (100 - invoice.schoolSharePercent) / 100) - (p._sum.amountNgn ?? 0)));
        }
        const amountNgn = input.amountNgn ?? available;
        if (!available || amountNgn > available)
            throw new errors_1.AppError(409, 'BALANCE_CHANGED', 'Refresh the bill; the amount is already paid or exceeds the remaining balance.');
        if (input.annual && amountNgn !== available)
            throw new errors_1.AppError(400, 'ANNUAL_FULL_PAYMENT', 'The annual discount requires full prepayment for all three terms.');
        if (input.channel === 'TRANSFER' && !input.bankReference)
            throw new errors_1.AppError(400, 'REFERENCE_REQUIRED', 'Enter the bank transfer reference.');
        if (input.channel === 'TRANSFER' && await tx.billingPayment.findUnique({ where: { externalReference: input.bankReference.toUpperCase() } }))
            throw new errors_1.AppError(409, 'DUPLICATE_REFERENCE', 'This bank reference has already been submitted. Review the existing payment instead.');
        return tx.billingPayment.create({ data: { organizationId: org, invoiceId: invoice.id, studentId: input.studentId, actorId: auth.userId, amountNgn, annual: input.annual, channel: input.channel, idempotencyKey: input.idempotencyKey, requestHash, reference: 'SCHSUB-' + (0, node_crypto_1.randomUUID)(), externalReference: input.channel === 'TRANSFER' ? input.bankReference.toUpperCase() : null, note: input.note } }).catch((error) => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
                throw new errors_1.AppError(409, 'DUPLICATE_REFERENCE', 'This bank reference or payment attempt already exists. Review the existing payment.');
            throw error;
        });
    });
    if (payment.channel === 'PAYSTACK' && payment.status === 'PENDING' && !payment.checkoutUrl) {
        const user = await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { email: true } });
        let email = user.email;
        if (input.studentId && auth.orgRole === 'STUDENT') {
            const student = await prisma_1.prisma.student.findFirst({ where: { id: input.studentId, organizationId: org, userId: auth.userId }, select: { contactEmail: true } });
            if (!student?.contactEmail)
                throw new errors_1.AppError(400, 'EMAIL_REQUIRED', 'Add your receipt email in student settings before paying.');
            email = student.contactEmail;
        }
        const checkout = await (0, paystack_1.initializeTransaction)({ email, amountKobo: payment.amountNgn * 100, reference: payment.reference, callback_url: origin + (input.studentId ? (auth.orgRole === 'STUDENT' ? '/student/fees' : '/parent/fees') : '/dashboard/subscription'), metadata: { kind: 'SCHOOLOS_SUBSCRIPTION', organizationId: org } });
        await prisma_1.prisma.billingPayment.updateMany({ where: { id: payment.id, status: 'PENDING', checkoutUrl: null }, data: { checkoutUrl: checkout.authorization_url } });
        return { ...payment, checkoutUrl: checkout.authorization_url };
    }
    return payment;
}
async function allocate(tx, payment) {
    let invoices = await tx.termSubscription.findMany({ where: { organizationId: payment.organizationId }, include: invoiceInclude, orderBy: { startDate: 'asc' } });
    if (payment.annual) {
        const anchor = invoices.find(i => i.id === payment.invoiceId);
        const year = invoices.filter(i => i.term.sessionId === anchor.term.sessionId);
        if (year.length === 3 && year.every(i => amounts(i).paidNgn === 0 || i.annualPrepaid)) {
            await tx.termSubscription.updateMany({ where: { id: { in: year.map(i => i.id) } }, data: { unitPriceNgn: 270, annualPrepaid: true } });
            invoices = await tx.termSubscription.findMany({ where: { organizationId: payment.organizationId }, include: invoiceInclude, orderBy: { startDate: 'asc' } });
        }
    }
    // Respect the selected term first. Excess remains explicit school credit for support to allocate/refund.
    if (payment.annual) {
        const anchor = invoices.find(i => i.id === payment.invoiceId);
        invoices = invoices.filter(i => i.term.sessionId === anchor.term.sessionId);
    }
    invoices.sort((a, b) => a.id === payment.invoiceId ? -1 : b.id === payment.invoiceId ? 1 : a.startDate.getTime() - b.startDate.getTime());
    let remaining = payment.amountNgn;
    for (const i of invoices) {
        if (!payment.annual && i.id !== payment.invoiceId)
            continue;
        const amount = Math.min(remaining, amounts(i).outstandingNgn);
        if (amount > 0) {
            await tx.billingAllocation.create({ data: { paymentId: payment.id, invoiceId: i.id, amountNgn: amount } });
            remaining -= amount;
        }
        if (!remaining)
            break;
    }
    return remaining;
}
async function verifyBillingPayment(reference) {
    const pending = await prisma_1.prisma.billingPayment.findUnique({ where: { reference } });
    if (!pending || pending.channel !== 'PAYSTACK')
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Subscription payment not found');
    if (pending.status === 'CONFIRMED')
        return pending;
    const verified = await (0, paystack_1.verifyTransaction)(reference);
    if (verified.status !== 'success') {
        if (['failed', 'abandoned', 'reversed'].includes(verified.status))
            await prisma_1.prisma.billingPayment.updateMany({ where: { id: pending.id, status: 'PENDING' }, data: { status: 'REJECTED', note: 'Provider status: ' + verified.status } });
        return { ...pending, status: ['failed', 'abandoned', 'reversed'].includes(verified.status) ? 'REJECTED' : pending.status, providerStatus: verified.status };
    }
    if (verified.reference !== reference || verified.currency !== 'NGN' || verified.amount !== pending.amountNgn * 100)
        throw new errors_1.AppError(409, 'PAYMENT_MISMATCH', 'The provider amount, currency or reference does not match.');
    return (0, schoolTransaction_1.schoolTransaction)(pending.organizationId, async (tx) => {
        const p = await tx.billingPayment.findUniqueOrThrow({ where: { id: pending.id } });
        if (p.status === 'CONFIRMED')
            return p;
        if (p.status === 'REVERSED')
            throw new errors_1.AppError(409, 'PAYMENT_REVERSED', 'Payment was reversed.');
        const result = await tx.billingPayment.update({ where: { id: p.id }, data: { status: 'CONFIRMED', paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(), reviewedAt: new Date() } });
        await allocate(tx, result);
        await tx.auditLog.create({ data: { organizationId: p.organizationId, actorId: p.actorId, action: 'PAYMENT_CREATED', entity: 'BillingPayment', entityId: p.id, metadata: { operation: 'SUBSCRIPTION_PAYMENT_VERIFIED', reference, amountNgn: p.amountNgn } } });
        return result;
    });
}
async function reviewBillingPayment(id, actorId, raw) {
    const input = zod_1.z.object({ decision: zod_1.z.enum(['CONFIRMED', 'REJECTED', 'REVERSED']), reason: zod_1.z.string().trim().min(5).max(500), reactivate: zod_1.z.boolean().default(false) }).strict().parse(raw);
    const known = await prisma_1.prisma.billingPayment.findUnique({ where: { id } });
    if (!known)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Payment not found');
    return (0, schoolTransaction_1.schoolTransaction)(known.organizationId, async (tx) => {
        const p = await tx.billingPayment.findUniqueOrThrow({ where: { id } });
        if (input.decision === 'CONFIRMED' && p.channel !== 'TRANSFER')
            throw new errors_1.AppError(400, 'VERIFY_ONLINE_PAYMENT', 'Online payments must be verified against the provider.');
        if (input.decision === 'REVERSED' && p.status !== 'CONFIRMED')
            throw new errors_1.AppError(409, 'PAYMENT_NOT_CONFIRMED', 'Only a confirmed payment can be reversed.');
        if (input.decision !== 'REVERSED' && p.status !== 'PENDING')
            throw new errors_1.AppError(409, 'PAYMENT_REVIEWED', 'This payment has already been reviewed.');
        await ensureInvoice(tx, p.organizationId);
        const updated = await tx.billingPayment.update({ where: { id }, data: { status: input.decision, reviewedById: actorId, reviewedAt: new Date(), paidAt: input.decision === 'CONFIRMED' ? new Date() : p.paidAt, note: input.reason } });
        if (input.decision === 'CONFIRMED')
            await allocate(tx, updated);
        if (input.decision === 'REVERSED' && p.annual) {
            const anchor = await tx.termSubscription.findUniqueOrThrow({ where: { id: p.invoiceId }, include: { term: true } });
            const others = await tx.billingPayment.count({ where: { organizationId: p.organizationId, annual: true, status: 'CONFIRMED', invoice: { term: { sessionId: anchor.term.sessionId } } } });
            if (!others)
                await tx.termSubscription.updateMany({ where: { organizationId: p.organizationId, term: { sessionId: anchor.term.sessionId } }, data: { unitPriceNgn: 300, annualPrepaid: false } });
        }
        if (input.reactivate && input.decision === 'CONFIRMED')
            await tx.organization.update({ where: { id: p.organizationId }, data: { isActive: true } });
        await tx.auditLog.create({ data: { organizationId: p.organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'BillingPayment', entityId: id, metadata: { operation: 'SUBSCRIPTION_PAYMENT_' + input.decision, reason: input.reason, reactivate: input.reactivate, amountNgn: p.amountNgn, reference: p.reference } } });
        return updated;
    });
}
async function applyBillingCredit(organizationId, actorId, invoiceId) {
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const invoice = await tx.termSubscription.findFirst({ where: { id: invoiceId, organizationId }, include: invoiceInclude });
        if (!invoice)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Subscription bill not found');
        let due = amounts(invoice).outstandingNgn;
        const payments = await tx.billingPayment.findMany({ where: { organizationId, status: 'CONFIRMED' }, include: { allocations: { where: { invoice: { organizationId } } } }, orderBy: { paidAt: 'asc' } });
        for (const p of payments) {
            const credit = p.amountNgn - p.allocations.reduce((n, a) => n + a.amountNgn, 0), amount = Math.min(due, credit);
            if (amount > 0) {
                await tx.billingAllocation.upsert({ where: { paymentId_invoiceId: { paymentId: p.id, invoiceId } }, create: { paymentId: p.id, invoiceId, amountNgn: amount }, update: { amountNgn: { increment: amount } } });
                due -= amount;
            }
            if (!due)
                break;
        }
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'TermSubscription', entityId: invoiceId, metadata: { operation: 'SUBSCRIPTION_CREDIT_APPLIED' } } });
        return { outstandingNgn: due };
    });
}
async function quoteAnnual(organizationId, invoiceId) {
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const anchor = await tx.termSubscription.findFirst({ where: { id: invoiceId, organizationId }, include: invoiceInclude });
        if (!anchor)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Subscription bill not found');
        const terms = await tx.term.findMany({ where: { sessionId: anchor.term.sessionId, session: { organizationId } }, orderBy: { startDate: 'asc' } });
        if (terms.length !== 3 || terms.some(t => !t.startDate || !t.endDate))
            throw new errors_1.AppError(400, 'ANNUAL_TERMS_REQUIRED', 'Set dates for all three terms before paying for the year.');
        const sub = await settings(tx, organizationId), invoices = await tx.termSubscription.findMany({ where: { organizationId, term: { sessionId: anchor.term.sessionId } }, include: invoiceInclude }), active = await tx.student.findMany({ where: { organizationId, isActive: true }, select: { id: true } });
        if (terms.some(t => t.endDate < sub.billingStartedAt && !invoices.some(i => i.termId === t.id)))
            throw new errors_1.AppError(400, 'ANNUAL_UNAVAILABLE', 'Annual prepayment requires three available terms.');
        if (invoices.some(i => amounts(i).paidNgn > 0 && !i.annualPrepaid))
            throw new errors_1.AppError(409, 'ANNUAL_ALREADY_STARTED', 'Annual discount is available only before paying for this school year.');
        const rows = terms.map(t => { const i = invoices.find(i => i.termId === t.id), students = i ? new Set([...i.seats.map(s => s.studentId), ...(i.endDate >= new Date() ? active.map(s => s.id) : [])]).size : active.length; return { term: t.name, students, amountNgn: Math.max(0, students * 270 - (i ? amounts(i).paidNgn : 0)) }; });
        return { amountNgn: rows.reduce((n, i) => n + i.amountNgn, 0), terms: rows, discountPercent: 10 };
    });
}
