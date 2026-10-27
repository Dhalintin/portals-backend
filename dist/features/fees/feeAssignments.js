"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentSchema = void 0;
exports.reconcileFeeAssignment = reconcileFeeAssignment;
exports.syncStudentAssignedFees = syncStudentAssignedFees;
exports.saveFeeAssignment = saveFeeAssignment;
const zod_1 = require("zod");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
const crypto_1 = require("crypto");
exports.assignmentSchema = zod_1.z.object({ id: zod_1.z.string().uuid().optional(), idempotencyKey: zod_1.z.string().uuid(), termId: zod_1.z.string().uuid(), name: zod_1.z.string().trim().min(1).max(120), classIds: zod_1.z.array(zod_1.z.string().uuid()).max(200), items: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().trim().min(1).max(100), amountNgn: zod_1.z.number().int().positive().max(2147483647) })).min(1).max(30) }).strict();
async function reconcileFeeAssignment(tx, organizationId, planId, studentId) {
    const plan = await tx.feeStructure.findFirstOrThrow({ where: { id: planId, organizationId, autoBill: true }, include: { items: { include: { feeCategory: true } } } });
    if (!plan.isActive)
        return;
    const students = await tx.student.findMany({ where: { organizationId, isActive: true, ...(studentId ? { id: studentId } : {}), ...(plan.targetClassIds.length ? { classId: { in: plan.targetClassIds } } : {}) }, select: { id: true } });
    const existing = await tx.invoice.findMany({ where: { organizationId, feeStructureId: plan.id, ...(studentId ? { studentId } : {}) }, include: { items: true } });
    const total = plan.items.reduce((sum, item) => sum + item.amountNgn, 0);
    const counters = await tx.$queryRaw `SELECT COALESCE(MAX(((regexp_match("invoiceNumber", '^INV-([0-9]+)$'))[1])::bigint),0) AS sequence FROM "Invoice" WHERE "organizationId" = ${organizationId}`;
    let sequence = Number(counters[0].sequence);
    const ids = new Set(students.map(s => s.id));
    for (const student of students) {
        const invoice = existing.find(i => i.studentId === student.id);
        const lines = plan.items.map(item => ({ feeCategoryId: item.feeCategoryId, description: item.feeCategory.name, amountNgn: item.amountNgn }));
        if (!invoice) {
            const legacy = await tx.invoice.findMany({ where: { organizationId, studentId: student.id, termId: plan.termId, feeStructureId: null, status: { notIn: ['CANCELLED', 'DRAFT'] }, items: { some: { feeCategoryId: { in: lines.map(i => i.feeCategoryId) } } } }, include: { items: true } });
            if (legacy.length) {
                const matching = legacy.filter(i => i.totalNgn === total && JSON.stringify(i.items.map(item => [item.feeCategoryId, item.amountNgn]).sort()) === JSON.stringify(lines.map(item => [item.feeCategoryId, item.amountNgn]).sort()));
                if (legacy.length !== 1 || matching.length !== 1)
                    throw new errors_1.AppError(409, 'LEGACY_BILL_REVIEW', 'Existing student bills already contain some of these charges. Review those bills before assigning the same items again.');
                await tx.invoice.update({ where: { id: matching[0].id }, data: { feeStructureId: plan.id } });
                continue;
            }
            await tx.invoice.create({ data: { organizationId, feeStructureId: plan.id, studentId: student.id, termId: plan.termId, invoiceNumber: 'INV-' + String(++sequence).padStart(6, '0'), status: 'ISSUED', totalNgn: total, paidNgn: 0, outstandingNgn: total, items: { create: lines } } });
            continue;
        }
        const same = invoice.totalNgn === total && JSON.stringify(invoice.items.map(i => [i.feeCategoryId, i.amountNgn]).sort()) === JSON.stringify(lines.map(i => [i.feeCategoryId, i.amountNgn]).sort());
        if (invoice.paidNgn > 0) {
            if (!same)
                throw new errors_1.AppError(409, 'FEE_HAS_PAYMENTS', 'This fee already has payments. Add a separate adjustment charge instead of changing its amounts.');
            continue;
        }
        if (!same || invoice.status === 'CANCELLED')
            await tx.invoice.update({ where: { id: invoice.id }, data: { totalNgn: total, outstandingNgn: total, status: 'ISSUED', items: { deleteMany: {}, create: lines } } });
    }
    for (const invoice of existing.filter(i => !ids.has(i.studentId) && i.status !== 'CANCELLED')) {
        if (invoice.paidNgn > 0)
            throw new errors_1.AppError(409, 'FEE_HAS_PAYMENTS', 'A student being removed from this fee already has payments. Keep the original classes and add a separate adjustment.');
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED', outstandingNgn: 0 } });
    }
}
async function syncStudentAssignedFees(tx, organizationId, studentId) {
    const plans = await tx.feeStructure.findMany({ where: { organizationId, autoBill: true, isActive: true, term: { isCurrent: true, session: { isCurrent: true } } }, select: { id: true } });
    for (const plan of plans)
        await reconcileFeeAssignment(tx, organizationId, plan.id, studentId);
}
async function saveFeeAssignment(organizationId, actorId, raw) {
    const input = exports.assignmentSchema.parse(raw);
    input.classIds = [...new Set(input.classIds)].sort();
    input.items = input.items.map(i => ({ ...i, name: i.name.trim() }));
    if (new Set(input.items.map(i => i.name.toLowerCase())).size !== input.items.length)
        throw new errors_1.AppError(400, 'DUPLICATE_ITEM', 'Each fee item must have a different name.');
    const total = input.items.reduce((sum, i) => sum + i.amountNgn, 0);
    if (!Number.isSafeInteger(total) || total > 2147483647)
        throw new errors_1.AppError(400, 'INVALID_AMOUNT', 'The total fee is too large.');
    const hash = (0, crypto_1.createHash)('sha256').update(JSON.stringify({ ...input, idempotencyKey: undefined })).digest('hex');
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const previous = await tx.importBatch.findUnique({ where: { organizationId_kind_idempotencyKey: { organizationId, kind: 'FEE_ASSIGNMENT', idempotencyKey: input.idempotencyKey } } });
        if (previous) {
            if (previous.requestHash !== hash)
                throw new errors_1.AppError(409, 'IDEMPOTENCY_CONFLICT', 'Retry the original fee save before changing its details.');
            return previous.result;
        }
        const term = await tx.term.findFirst({ where: { id: input.termId, session: { organizationId } }, include: { session: true } });
        if (!term)
            throw new errors_1.AppError(400, 'INVALID_TERM', 'Choose a term belonging to this school.');
        if (input.classIds.length && (await tx.class.count({ where: { organizationId, isActive: true, id: { in: input.classIds } } })) !== input.classIds.length)
            throw new errors_1.AppError(400, 'INVALID_CLASSES', 'Select active classes from this school.');
        const old = input.id ? await tx.feeStructure.findFirst({ where: { id: input.id, organizationId }, include: { items: true } }) : null;
        if (input.id && !old)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Fee schedule not found.');
        if (old && old.termId !== input.termId)
            throw new errors_1.AppError(400, 'TERM_LOCKED', 'Keep this schedule in its original term. Create a new schedule for another term.');
        const others = await tx.feeStructure.findMany({ where: { organizationId, termId: input.termId, autoBill: true, isActive: true, ...(old ? { id: { not: old.id } } : {}) }, include: { items: { include: { feeCategory: true } } } });
        const overlap = others.find(p => (!p.targetClassIds.length || !input.classIds.length || p.targetClassIds.some(id => input.classIds.includes(id))) && p.items.some(i => input.items.some(line => line.name.toLowerCase() === i.feeCategory.name.toLowerCase())));
        if (overlap)
            throw new errors_1.AppError(409, 'OVERLAPPING_FEES', 'Some of these classes already have the same fee item in “' + overlap.name + '”. Edit that schedule or select different classes.');
        const items = [];
        for (const line of input.items) {
            const existing = await tx.feeCategory.findFirst({ where: { organizationId, name: { equals: line.name, mode: 'insensitive' } } });
            const category = existing ?? await tx.feeCategory.create({ data: { organizationId, name: line.name } });
            if (!category.isActive)
                throw new errors_1.AppError(400, 'INACTIVE_CATEGORY', 'The fee item ' + line.name + ' is inactive.');
            items.push({ feeCategoryId: category.id, amountNgn: line.amountNgn });
        }
        if (old && !old.autoBill) {
            const legacy = await tx.invoiceBatch.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: 'fee-plan-' + old.id } } });
            if (legacy)
                await tx.invoice.updateMany({ where: { organizationId, batchId: legacy.id, feeStructureId: null }, data: { feeStructureId: old.id } });
        }
        const plan = old ? await tx.feeStructure.update({ where: { id: old.id }, data: { name: input.name, autoBill: true, isActive: true, targetClassIds: input.classIds, classId: null, items: { deleteMany: {}, create: items } } }) : await tx.feeStructure.create({ data: { organizationId, name: input.name, termId: term.id, sessionId: term.sessionId, autoBill: true, targetClassIds: input.classIds, items: { create: items } } });
        await reconcileFeeAssignment(tx, organizationId, plan.id);
        const totals = await tx.invoice.aggregate({ where: { organizationId, feeStructureId: plan.id, status: { not: 'CANCELLED' } }, _count: { _all: true }, _sum: { totalNgn: true, paidNgn: true, outstandingNgn: true } });
        const result = { id: plan.id, students: totals._count._all, expectedNgn: totals._sum.totalNgn ?? 0, receivedNgn: totals._sum.paidNgn ?? 0 };
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'FeeStructure', entityId: plan.id, metadata: { operation: 'FEE_ASSIGNMENT_SAVED', name: input.name, classIds: input.classIds, items: input.items, previousItems: old?.items ?? [], ...result } } });
        await tx.importBatch.create({ data: { organizationId, kind: 'FEE_ASSIGNMENT', idempotencyKey: input.idempotencyKey, requestHash: hash, result } });
        return result;
    });
}
