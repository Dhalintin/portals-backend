"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const http_1 = require("../../lib/http");
const errors_1 = require("../../lib/errors");
const prisma_1 = require("../../lib/prisma");
const termBilling_1 = require("./termBilling");
const resourceAccess_1 = require("../../auth/resourceAccess");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
const handle = (fn) => async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await fn(req));
    }
    catch (e) {
        next(e);
    }
};
router.get('/', handle(async (req) => { const sub = await prisma_1.prisma.subscription.findUnique({ where: { organizationId: req.auth.schoolId } }); return { plan: 'PER_STUDENT', status: (await (0, termBilling_1.billingAccess)(req.auth.schoolId)).status, studentCap: 1000000, sponsorship: sub?.sponsorship ?? 'SCHOOL', studentCount: await prisma_1.prisma.student.count({ where: { organizationId: req.auth.schoolId, isActive: true } }) }; }));
router.get('/access', handle(req => (0, termBilling_1.billingAccess)(req.auth.schoolId)));
router.get('/billing', handle(req => {
    if (!(0, termBilling_1.manager)(req.auth))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'School accounts access required');
    return (0, termBilling_1.billingWorkspace)(req.auth.schoolId);
}));
router.get('/quote/:id', handle(req => {
    if (!(0, termBilling_1.manager)(req.auth))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'School accounts access required');
    return (0, termBilling_1.quoteAnnual)(req.auth.schoolId, zod_1.z.string().uuid().parse(req.params.id));
}));
router.patch('/sponsorship', handle(req => (0, termBilling_1.changeSponsorship)(req.auth, req.body)));
router.get('/family/:studentId', handle(req => (0, termBilling_1.familyBilling)(req.auth, zod_1.z.string().uuid().parse(req.params.studentId))));
// Reconcile a saved browser attempt without creating or charging another payment.
router.get('/payment-attempts/:key', handle(req => prisma_1.prisma.billingPayment.findFirst({
    where: { organizationId: req.auth.schoolId, actorId: req.auth.userId, idempotencyKey: zod_1.z.string().uuid().parse(req.params.key) },
    select: { id: true, reference: true, invoiceId: true, amountNgn: true, channel: true, status: true, checkoutUrl: true, createdAt: true },
})));
router.post('/payments', handle(req => (0, termBilling_1.startBillingPayment)(req.auth, req.body)));
router.post('/payments/:reference/verify', handle(async (req) => {
    const p = await prisma_1.prisma.billingPayment.findFirst({ where: { reference: req.params.reference, organizationId: req.auth.schoolId } });
    if (!p)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Payment not found');
    if (!(0, termBilling_1.manager)(req.auth)) {
        if (p.actorId !== req.auth.userId || !p.studentId)
            throw new errors_1.AppError(403, 'FORBIDDEN', 'This payment belongs to another account');
        await (0, resourceAccess_1.assertParentChildAccess)(req.auth, p.studentId);
    }
    return (0, termBilling_1.verifyBillingPayment)(p.reference);
}));
router.get('/receipts/:id', handle(async (req) => {
    const p = await prisma_1.prisma.billingPayment.findFirst({ where: { id: req.params.id, organizationId: req.auth.schoolId, status: 'CONFIRMED' }, include: { allocations: { include: { invoice: { include: { term: { include: { session: true } } } } } }, organization: { select: { name: true } } } });
    if (!p)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Confirmed receipt not found');
    if (!(0, termBilling_1.manager)(req.auth)) {
        if (!p.studentId || p.actorId !== req.auth.userId)
            throw new errors_1.AppError(403, 'FORBIDDEN', 'This receipt belongs to another account');
        await (0, resourceAccess_1.assertParentChildAccess)(req.auth, p.studentId);
    }
    return { receiptNumber: p.reference, school: p.organization.name, amountNgn: p.amountNgn, date: p.paidAt, channel: p.channel, allocations: p.allocations.map(a => ({ term: a.invoice.term.name, session: a.invoice.term.session.name, amountNgn: a.amountNgn })), creditNgn: p.amountNgn - p.allocations.reduce((n, a) => n + a.amountNgn, 0) };
}));
router.post('/credit', handle(req => {
    if (!(0, termBilling_1.manager)(req.auth))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'School accounts access required');
    return (0, termBilling_1.applyBillingCredit)(req.auth.schoolId, req.auth.userId, zod_1.z.object({ invoiceId: zod_1.z.string().uuid() }).parse(req.body).invoiceId);
}));
exports.default = router;
