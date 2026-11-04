import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { schoolTransaction } from '../../lib/schoolTransaction';
import { AppError } from '../../lib/errors';
import { sendSuccess } from '../../lib/http';
import { verifyPassword } from '../../lib/password';
import { requireSuperAdmin } from '../../middlewares/requirePlatform';
import { billingWorkspace, billingAccess, startBillingPayment, reviewBillingPayment, applyBillingCredit, amounts, verifyBillingPayment } from '../subscriptions/termBilling';
export const billingAdminRoutes = Router();
const run = (fn: (r: any) => Promise<unknown>) => async (req: any, res: any, next: any) => { try {
    sendSuccess(res, await fn(req));
}
catch (e) {
    next(e);
} };
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(100).optional() });
billingAdminRoutes.get('/console', run(async () => {
    const [schools, students, users, received, invoices, pending, recent] = await Promise.all([prisma.organization.count(), prisma.student.count({ where: { isActive: true } }), prisma.user.count({ where: { isActive: true } }), prisma.billingPayment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountNgn: true } }), prisma.termSubscription.findMany({ include: { _count: { select: { seats: true } }, allocations: { where: { payment: { status: 'CONFIRMED' } } } } }), prisma.billingPayment.count({ where: { status: 'PENDING', channel: 'TRANSFER' } }), prisma.organization.findMany({ take: 8, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, isActive: true, createdAt: true, _count: { select: { students: { where: { isActive: true } } } } } })]);
    const [active, paused] = await Promise.all([prisma.organization.count({ where: { isActive: true } }), prisma.organization.count({ where: { isActive: false } })]);
    const due = invoices.reduce((n, i) => n + Math.max(0, i._count.seats * i.unitPriceNgn - i.allocations.reduce((t, a) => t + a.amountNgn, 0)), 0), overdue = invoices.filter(i => i.balanceDueAt < new Date() && i._count.seats * i.unitPriceNgn > i.allocations.reduce((n, a) => n + a.amountNgn, 0));
    return { schools, activeSchools: active, pausedSchools: paused, students, users, receivedNgn: received._sum.amountNgn ?? 0, outstandingNgn: due, overdueSchools: new Set(overdue.map(i => i.organizationId)).size, pendingTransfers: pending, recent, generatedAt: new Date() };
}));
billingAdminRoutes.get('/console/schools', run(async (req) => {
    const q = paging.parse(req.query), where = q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { email: { contains: q.search, mode: 'insensitive' as const } }] } : {};
    const [items, total] = await Promise.all([prisma.organization.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, email: true, phone: true, city: true, isActive: true, onBoarded: true, createdAt: true, subscription: true, _count: { select: { students: { where: { isActive: true } }, memberships: { where: { isActive: true } }, classes: { where: { isActive: true } }, parents: { where: { isActive: true } } } } } }), prisma.organization.count({ where })]);
    const rows = [];
    for (const school of items)
        rows.push({ ...school, access: await billingAccess(school.id) });
    return { items: rows, total, page: q.page, totalPages: Math.ceil(total / q.limit) };
}));
billingAdminRoutes.get('/console/schools/:id', run(async (req) => {
    const id = z.string().uuid().parse(req.params.id), school = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, city: true, address: true, isActive: true, createdAt: true, onBoarded: true, creator: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { students: { where: { isActive: true } }, memberships: { where: { isActive: true } }, parents: { where: { isActive: true } }, classes: { where: { isActive: true } }, subjects: true } } } });
    if (!school)
        throw new AppError(404, 'NOT_FOUND', 'School not found');
    const [billing, calendar, activity] = await Promise.all([billingWorkspace(id), prisma.academicSession.findMany({ where: { organizationId: id }, include: { terms: true }, orderBy: { createdAt: 'desc' } }), prisma.auditLog.findMany({ where: { organizationId: id, entity: { in: ['BillingPayment', 'TermSubscription', 'Subscription', 'Organization'] } }, include: { actor: { select: { firstName: true, lastName: true } } }, take: 30, orderBy: { createdAt: 'desc' } })]);
    return { school, billing, calendar, activity };
}));
billingAdminRoutes.get('/console/payments', run(async (req) => {
    const q = paging.extend({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'REVERSED']).optional() }).parse(req.query), where = { ...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' as const } }, { externalReference: { contains: q.search, mode: 'insensitive' as const } }, { organization: { name: { contains: q.search, mode: 'insensitive' as const } } }] } : {}) };
    const [items, total] = await Promise.all([prisma.billingPayment.findMany({ where, include: { organization: { select: { id: true, name: true } }, invoice: { include: { term: { include: { session: true } } } }, allocations: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }), prisma.billingPayment.count({ where })]);
    return { items, total, page: q.page, totalPages: Math.ceil(total / q.limit) };
}));
billingAdminRoutes.post('/console/payments/:id/verify', run(async (req) => { const id = z.string().uuid().parse(req.params.id), p = await prisma.billingPayment.findUnique({ where: { id }, select: { reference: true } }); if (!p)
    throw new AppError(404, 'NOT_FOUND', 'Payment not found'); return verifyBillingPayment(p.reference); }));
billingAdminRoutes.post('/console/payments/:id/review', run(req => reviewBillingPayment(z.string().uuid().parse(req.params.id), req.auth.userId, req.body)));
billingAdminRoutes.post('/console/schools/:id/payments', run(async (req) => {
    const id = z.string().uuid().parse(req.params.id), input = z.object({ invoiceId: z.string().uuid(), amountNgn: z.number().int().positive().max(300000000), bankReference: z.string().trim().min(4).max(120), reason: z.string().trim().min(5).max(500), idempotencyKey: z.string().uuid(), reactivate: z.boolean().default(false), annual: z.boolean().default(false) }).strict().parse(req.body);
    const p = await startBillingPayment({ ...req.auth, schoolId: id, permissions: ['payments:write'] }, { invoiceId: input.invoiceId, amountNgn: input.amountNgn, bankReference: input.bankReference, note: input.reason, annual: input.annual, idempotencyKey: input.idempotencyKey, channel: 'TRANSFER' });
    return p.status === 'PENDING' ? reviewBillingPayment(p.id, req.auth.userId, { decision: 'CONFIRMED', reason: input.reason, reactivate: input.reactivate }) : p;
}));
billingAdminRoutes.post('/console/schools/:id/credit', run(req => applyBillingCredit(z.string().uuid().parse(req.params.id), req.auth.userId, z.object({ invoiceId: z.string().uuid() }).parse(req.body).invoiceId)));
billingAdminRoutes.post('/console/schools/:id/extension', run(async (req) => {
    const id = z.string().uuid().parse(req.params.id), input = z.object({ until: z.string().datetime().nullable(), reason: z.string().trim().min(5).max(500) }).strict().parse(req.body), until = input.until ? new Date(input.until) : null;
    if (until && (until <= new Date() || until.getTime() > Date.now() + 31 * 86400000))
        throw new AppError(400, 'INVALID_EXTENSION', 'Choose a future date within 31 days.');
    return schoolTransaction(id, async (tx) => { await tx.subscription.update({ where: { organizationId: id }, data: { accessUntil: until } }); await tx.auditLog.create({ data: { organizationId: id, actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'Subscription', metadata: { operation: 'ACCESS_EXTENSION', until: input.until, reason: input.reason } } }); return { ok: true }; });
}));
billingAdminRoutes.get('/console/settings', run(() => prisma.platformBillingSettings.findUnique({ where: { id: 'billing' } })));
billingAdminRoutes.put('/console/settings', requireSuperAdmin, run(async (req) => {
    const { password, ...input } = z.object({ bankName: z.string().trim().min(2).max(100), accountName: z.string().trim().min(2).max(150), accountNumber: z.string().regex(/^\d{10}$/), supportEmail: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict().parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!await verifyPassword(password, user.passwordHash))
        throw new AppError(403, 'REAUTHENTICATION_REQUIRED', 'Enter your current platform password.');
    return prisma.$transaction(async (tx) => { const updated = await tx.platformBillingSettings.upsert({ where: { id: 'billing' }, create: { id: 'billing', ...input }, update: input }); await tx.auditLog.create({ data: { actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'PlatformBillingSettings', metadata: { operation: 'PLATFORM_BANK_UPDATED', accountEnding: input.accountNumber.slice(-4) } } }); return updated; });
}));
billingAdminRoutes.get('/console/activity', run(() => prisma.auditLog.findMany({ where: { entity: { in: ['BillingPayment', 'Subscription', 'PlatformBillingSettings', 'PlatformUser', 'Organization'] } }, include: { actor: { select: { firstName: true, lastName: true } }, organization: { select: { name: true } } }, take: 100, orderBy: { createdAt: 'desc' } })));
billingAdminRoutes.get('/console/team', requireSuperAdmin, run(() => prisma.user.findMany({ where: { globalRole: { in: ['PLATFORM_ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, email: true, firstName: true, lastName: true, globalRole: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } })));
billingAdminRoutes.patch('/console/team/:id', requireSuperAdmin, run(async (req) => {
    const id = z.string().uuid().parse(req.params.id), input = z.object({ isActive: z.boolean(), reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
    if (id === req.auth.userId)
        throw new AppError(400, 'SELF_CHANGE', 'You cannot disable your own access.');
    return schoolTransaction('platform-team', async (tx) => { const target = await tx.user.findFirst({ where: { id, globalRole: { in: ['PLATFORM_ADMIN', 'SUPER_ADMIN'] } } }); if (!target)
        throw new AppError(404, 'NOT_FOUND', 'Platform administrator not found'); if (!input.isActive && target.globalRole === 'SUPER_ADMIN' && await tx.user.count({ where: { globalRole: 'SUPER_ADMIN', isActive: true } }) <= 1)
        throw new AppError(409, 'LAST_SUPER_ADMIN', 'Keep at least one active super administrator.'); const user = await tx.user.update({ where: { id }, data: { isActive: input.isActive, authVersion: { increment: 1 } }, select: { id: true, isActive: true } }); await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }); await tx.auditLog.create({ data: { actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'PlatformUser', entityId: id, metadata: { operation: 'PLATFORM_ACCESS_CHANGED', ...input } } }); return user; });
}));
