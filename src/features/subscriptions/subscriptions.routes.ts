import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/authenticate';
import { requireSchool } from '../../middlewares/requireSchool';
import { sendSuccess } from '../../lib/http';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { billingAccess, billingWorkspace, manager, changeSponsorship, familyBilling, startBillingPayment, verifyBillingPayment, applyBillingCredit, quoteAnnual } from './termBilling';
import { assertParentChildAccess } from '../../auth/resourceAccess';
const router = Router();
router.use(authenticate, requireSchool);
const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any, next: any) => { try {
    sendSuccess(res, await fn(req));
}
catch (e) {
    next(e);
} };
router.get('/', handle(async (req) => { const sub = await prisma.subscription.findUnique({ where: { organizationId: req.auth.schoolId } }); return { plan: 'PER_STUDENT', status: (await billingAccess(req.auth.schoolId)).status, studentCap: 1000000, sponsorship: sub?.sponsorship ?? 'SCHOOL', studentCount: await prisma.student.count({ where: { organizationId: req.auth.schoolId, isActive: true } }) }; }));
router.get('/access', handle(req => billingAccess(req.auth.schoolId)));
router.get('/billing', handle(req => { if (!manager(req.auth))
    throw new AppError(403, 'FORBIDDEN', 'School accounts access required'); return billingWorkspace(req.auth.schoolId); }));
router.get('/quote/:id', handle(req => { if (!manager(req.auth))
    throw new AppError(403, 'FORBIDDEN', 'School accounts access required'); return quoteAnnual(req.auth.schoolId, z.string().uuid().parse(req.params.id)); }));
router.patch('/sponsorship', handle(req => changeSponsorship(req.auth, req.body)));
router.get('/family/:studentId', handle(req => familyBilling(req.auth, z.string().uuid().parse(req.params.studentId))));
// Reconcile a saved browser attempt without creating or charging another payment.
router.get('/payment-attempts/:key', handle(req => prisma.billingPayment.findFirst({
    where: { organizationId: req.auth.schoolId, actorId: req.auth.userId, idempotencyKey: z.string().uuid().parse(req.params.key) },
    select: { id: true, reference: true, invoiceId: true, amountNgn: true, channel: true, status: true, checkoutUrl: true, createdAt: true },
})));
router.post('/payments', handle(req => startBillingPayment(req.auth, req.body)));
router.post('/payments/:reference/verify', handle(async (req) => { const p = await prisma.billingPayment.findFirst({ where: { reference: req.params.reference, organizationId: req.auth.schoolId } }); if (!p)
    throw new AppError(404, 'NOT_FOUND', 'Payment not found'); if (!manager(req.auth)) {
    if (p.actorId !== req.auth.userId || !p.studentId)
        throw new AppError(403, 'FORBIDDEN', 'This payment belongs to another account');
    await assertParentChildAccess(req.auth, p.studentId);
} return verifyBillingPayment(p.reference); }));
router.get('/receipts/:id', handle(async (req) => { const p = await prisma.billingPayment.findFirst({ where: { id: req.params.id, organizationId: req.auth.schoolId, status: 'CONFIRMED' }, include: { allocations: { include: { invoice: { include: { term: { include: { session: true } } } } } }, organization: { select: { name: true } } } }); if (!p)
    throw new AppError(404, 'NOT_FOUND', 'Confirmed receipt not found'); if (!manager(req.auth)) {
    if (!p.studentId || p.actorId !== req.auth.userId)
        throw new AppError(403, 'FORBIDDEN', 'This receipt belongs to another account');
    await assertParentChildAccess(req.auth, p.studentId);
} return { receiptNumber: p.reference, school: p.organization.name, amountNgn: p.amountNgn, date: p.paidAt, channel: p.channel, allocations: p.allocations.map(a => ({ term: a.invoice.term.name, session: a.invoice.term.session.name, amountNgn: a.amountNgn })), creditNgn: p.amountNgn - p.allocations.reduce((n, a) => n + a.amountNgn, 0) }; }));
router.post('/credit', handle(req => { if (!manager(req.auth))
    throw new AppError(403, 'FORBIDDEN', 'School accounts access required'); return applyBillingCredit(req.auth.schoolId, req.auth.userId, z.object({ invoiceId: z.string().uuid() }).parse(req.body).invoiceId); }));
export default router;
