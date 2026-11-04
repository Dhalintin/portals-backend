"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingAdminRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
const http_1 = require("../../lib/http");
const password_1 = require("../../lib/password");
const requirePlatform_1 = require("../../middlewares/requirePlatform");
const termBilling_1 = require("../subscriptions/termBilling");
exports.billingAdminRoutes = (0, express_1.Router)();
const run = (fn) => async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await fn(req));
    }
    catch (e) {
        next(e);
    }
};
const paging = zod_1.z.object({ page: zod_1.z.coerce.number().int().min(1).default(1), limit: zod_1.z.coerce.number().int().min(1).max(100).default(25), search: zod_1.z.string().trim().max(100).optional() });
exports.billingAdminRoutes.get('/console', run(async () => {
    const [schools, students, users, received, invoices, pending, recent] = await Promise.all([prisma_1.prisma.organization.count(), prisma_1.prisma.student.count({ where: { isActive: true } }), prisma_1.prisma.user.count({ where: { isActive: true } }), prisma_1.prisma.billingPayment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountNgn: true } }), prisma_1.prisma.termSubscription.findMany({ include: { _count: { select: { seats: true } }, allocations: { where: { payment: { status: 'CONFIRMED' } } } } }), prisma_1.prisma.billingPayment.count({ where: { status: 'PENDING', channel: 'TRANSFER' } }), prisma_1.prisma.organization.findMany({ take: 8, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, isActive: true, createdAt: true, _count: { select: { students: { where: { isActive: true } } } } } })]);
    const [active, paused] = await Promise.all([prisma_1.prisma.organization.count({ where: { isActive: true } }), prisma_1.prisma.organization.count({ where: { isActive: false } })]);
    const due = invoices.reduce((n, i) => n + Math.max(0, i._count.seats * i.unitPriceNgn - i.allocations.reduce((t, a) => t + a.amountNgn, 0)), 0), overdue = invoices.filter(i => i.balanceDueAt < new Date() && i._count.seats * i.unitPriceNgn > i.allocations.reduce((n, a) => n + a.amountNgn, 0));
    return { schools, activeSchools: active, pausedSchools: paused, students, users, receivedNgn: received._sum.amountNgn ?? 0, outstandingNgn: due, overdueSchools: new Set(overdue.map(i => i.organizationId)).size, pendingTransfers: pending, recent, generatedAt: new Date() };
}));
exports.billingAdminRoutes.get('/console/schools', run(async (req) => {
    const q = paging.parse(req.query), where = q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {};
    const [items, total] = await Promise.all([prisma_1.prisma.organization.findMany({ where, skip: (q.page - 1) * q.limit, take: q.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, email: true, phone: true, city: true, isActive: true, onBoarded: true, createdAt: true, subscription: true, _count: { select: { students: { where: { isActive: true } }, memberships: { where: { isActive: true } }, classes: { where: { isActive: true } }, parents: { where: { isActive: true } } } } } }), prisma_1.prisma.organization.count({ where })]);
    const rows = [];
    for (const school of items)
        rows.push({ ...school, access: await (0, termBilling_1.billingAccess)(school.id) });
    return { items: rows, total, page: q.page, totalPages: Math.ceil(total / q.limit) };
}));
exports.billingAdminRoutes.get('/console/schools/:id', run(async (req) => {
    const id = zod_1.z.string().uuid().parse(req.params.id), school = await prisma_1.prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, city: true, address: true, isActive: true, createdAt: true, onBoarded: true, creator: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { students: { where: { isActive: true } }, memberships: { where: { isActive: true } }, parents: { where: { isActive: true } }, classes: { where: { isActive: true } }, subjects: true } } } });
    if (!school)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'School not found');
    const [billing, calendar, activity] = await Promise.all([(0, termBilling_1.billingWorkspace)(id), prisma_1.prisma.academicSession.findMany({ where: { organizationId: id }, include: { terms: true }, orderBy: { createdAt: 'desc' } }), prisma_1.prisma.auditLog.findMany({ where: { organizationId: id, entity: { in: ['BillingPayment', 'TermSubscription', 'Subscription', 'Organization'] } }, include: { actor: { select: { firstName: true, lastName: true } } }, take: 30, orderBy: { createdAt: 'desc' } })]);
    return { school, billing, calendar, activity };
}));
exports.billingAdminRoutes.get('/console/payments', run(async (req) => {
    const q = paging.extend({ status: zod_1.z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'REVERSED']).optional() }).parse(req.query), where = { ...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { externalReference: { contains: q.search, mode: 'insensitive' } }, { organization: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await Promise.all([prisma_1.prisma.billingPayment.findMany({ where, include: { organization: { select: { id: true, name: true } }, invoice: { include: { term: { include: { session: true } } } }, allocations: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }), prisma_1.prisma.billingPayment.count({ where })]);
    return { items, total, page: q.page, totalPages: Math.ceil(total / q.limit) };
}));
exports.billingAdminRoutes.post('/console/payments/:id/verify', run(async (req) => {
    const id = zod_1.z.string().uuid().parse(req.params.id), p = await prisma_1.prisma.billingPayment.findUnique({ where: { id }, select: { reference: true } });
    if (!p)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Payment not found');
    return (0, termBilling_1.verifyBillingPayment)(p.reference);
}));
exports.billingAdminRoutes.post('/console/payments/:id/review', run(req => (0, termBilling_1.reviewBillingPayment)(zod_1.z.string().uuid().parse(req.params.id), req.auth.userId, req.body)));
exports.billingAdminRoutes.post('/console/schools/:id/payments', run(async (req) => {
    const id = zod_1.z.string().uuid().parse(req.params.id), input = zod_1.z.object({ invoiceId: zod_1.z.string().uuid(), amountNgn: zod_1.z.number().int().positive().max(300000000), bankReference: zod_1.z.string().trim().min(4).max(120), reason: zod_1.z.string().trim().min(5).max(500), idempotencyKey: zod_1.z.string().uuid(), reactivate: zod_1.z.boolean().default(false), annual: zod_1.z.boolean().default(false) }).strict().parse(req.body);
    const p = await (0, termBilling_1.startBillingPayment)({ ...req.auth, schoolId: id, permissions: ['payments:write'] }, { invoiceId: input.invoiceId, amountNgn: input.amountNgn, bankReference: input.bankReference, note: input.reason, annual: input.annual, idempotencyKey: input.idempotencyKey, channel: 'TRANSFER' });
    return p.status === 'PENDING' ? (0, termBilling_1.reviewBillingPayment)(p.id, req.auth.userId, { decision: 'CONFIRMED', reason: input.reason, reactivate: input.reactivate }) : p;
}));
exports.billingAdminRoutes.post('/console/schools/:id/credit', run(req => (0, termBilling_1.applyBillingCredit)(zod_1.z.string().uuid().parse(req.params.id), req.auth.userId, zod_1.z.object({ invoiceId: zod_1.z.string().uuid() }).parse(req.body).invoiceId)));
exports.billingAdminRoutes.post('/console/schools/:id/extension', run(async (req) => {
    const id = zod_1.z.string().uuid().parse(req.params.id), input = zod_1.z.object({ until: zod_1.z.string().datetime().nullable(), reason: zod_1.z.string().trim().min(5).max(500) }).strict().parse(req.body), until = input.until ? new Date(input.until) : null;
    if (until && (until <= new Date() || until.getTime() > Date.now() + 31 * 86400000))
        throw new errors_1.AppError(400, 'INVALID_EXTENSION', 'Choose a future date within 31 days.');
    return (0, schoolTransaction_1.schoolTransaction)(id, async (tx) => { await tx.subscription.update({ where: { organizationId: id }, data: { accessUntil: until } }); await tx.auditLog.create({ data: { organizationId: id, actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'Subscription', metadata: { operation: 'ACCESS_EXTENSION', until: input.until, reason: input.reason } } }); return { ok: true }; });
}));
exports.billingAdminRoutes.get('/console/settings', run(() => prisma_1.prisma.platformBillingSettings.findUnique({ where: { id: 'billing' } })));
exports.billingAdminRoutes.put('/console/settings', requirePlatform_1.requireSuperAdmin, run(async (req) => {
    const { password, ...input } = zod_1.z.object({ bankName: zod_1.z.string().trim().min(2).max(100), accountName: zod_1.z.string().trim().min(2).max(150), accountNumber: zod_1.z.string().regex(/^\d{10}$/), supportEmail: zod_1.z.string().trim().email().max(254), password: zod_1.z.string().min(1).max(128) }).strict().parse(req.body);
    const user = await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!await (0, password_1.verifyPassword)(password, user.passwordHash))
        throw new errors_1.AppError(403, 'REAUTHENTICATION_REQUIRED', 'Enter your current platform password.');
    return prisma_1.prisma.$transaction(async (tx) => { const updated = await tx.platformBillingSettings.upsert({ where: { id: 'billing' }, create: { id: 'billing', ...input }, update: input }); await tx.auditLog.create({ data: { actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'PlatformBillingSettings', metadata: { operation: 'PLATFORM_BANK_UPDATED', accountEnding: input.accountNumber.slice(-4) } } }); return updated; });
}));
exports.billingAdminRoutes.get('/console/activity', run(() => prisma_1.prisma.auditLog.findMany({ where: { entity: { in: ['BillingPayment', 'Subscription', 'PlatformBillingSettings', 'PlatformUser', 'Organization'] } }, include: { actor: { select: { firstName: true, lastName: true } }, organization: { select: { name: true } } }, take: 100, orderBy: { createdAt: 'desc' } })));
exports.billingAdminRoutes.get('/console/team', requirePlatform_1.requireSuperAdmin, run(() => prisma_1.prisma.user.findMany({ where: { globalRole: { in: ['PLATFORM_ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, email: true, firstName: true, lastName: true, globalRole: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } })));
exports.billingAdminRoutes.patch('/console/team/:id', requirePlatform_1.requireSuperAdmin, run(async (req) => {
    const id = zod_1.z.string().uuid().parse(req.params.id), input = zod_1.z.object({ isActive: zod_1.z.boolean(), reason: zod_1.z.string().trim().min(5).max(500) }).strict().parse(req.body);
    if (id === req.auth.userId)
        throw new errors_1.AppError(400, 'SELF_CHANGE', 'You cannot disable your own access.');
    return (0, schoolTransaction_1.schoolTransaction)('platform-team', async (tx) => {
        const target = await tx.user.findFirst({ where: { id, globalRole: { in: ['PLATFORM_ADMIN', 'SUPER_ADMIN'] } } });
        if (!target)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Platform administrator not found');
        if (!input.isActive && target.globalRole === 'SUPER_ADMIN' && await tx.user.count({ where: { globalRole: 'SUPER_ADMIN', isActive: true } }) <= 1)
            throw new errors_1.AppError(409, 'LAST_SUPER_ADMIN', 'Keep at least one active super administrator.');
        const user = await tx.user.update({ where: { id }, data: { isActive: input.isActive, authVersion: { increment: 1 } }, select: { id: true, isActive: true } });
        await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({ data: { actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'PlatformUser', entityId: id, metadata: { operation: 'PLATFORM_ACCESS_CHANGED', ...input } } });
        return user;
    });
}));
