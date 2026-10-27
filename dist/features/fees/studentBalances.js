"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentBalancesQuery = void 0;
exports.groupStudentBalances = groupStudentBalances;
exports.studentBalances = studentBalances;
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
exports.studentBalancesQuery = zod_1.z.object({
    termId: zod_1.z.string().uuid(),
    search: zod_1.z.string().trim().max(120).default(''),
    paymentState: zod_1.z.enum(['owing', 'unpaid', 'partial', 'paid', 'all']).default('owing'),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().refine(n => [25, 50, 100].includes(n), 'Choose 25, 50 or 100 rows').default(25),
});
function groupStudentBalances(bills) {
    const groups = new Map();
    for (const bill of bills) {
        let row = groups.get(bill.studentId);
        if (!row) {
            row = { studentId: bill.studentId, name: [bill.student.lastName, bill.student.firstName].filter(Boolean).join(', '), admissionNumber: bill.student.admissionNumber, className: bill.student.class ? [bill.student.class.name, bill.student.class.arm].filter(Boolean).join(' ') : 'Unassigned', totalNgn: 0, paidNgn: 0, outstandingNgn: 0, items: [], bills: [] };
            groups.set(bill.studentId, row);
        }
        row.totalNgn += bill.totalNgn;
        row.paidNgn += bill.paidNgn;
        row.outstandingNgn += bill.outstandingNgn;
        for (const item of bill.items)
            if (!row.items.includes(item.description))
                row.items.push(item.description);
        row.bills.push({ id: bill.id, invoiceNumber: bill.invoiceNumber, totalNgn: bill.totalNgn, paidNgn: bill.paidNgn, outstandingNgn: bill.outstandingNgn, items: bill.items });
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.admissionNumber.localeCompare(b.admissionNumber) || a.studentId.localeCompare(b.studentId));
}
async function studentBalances(organizationId, raw) {
    const query = exports.studentBalancesQuery.parse(raw);
    if (!await prisma_1.prisma.term.findFirst({ where: { id: query.termId, session: { organizationId } }, select: { id: true } }))
        throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    const bills = await prisma_1.prisma.invoice.findMany({ where: { organizationId, termId: query.termId, status: { notIn: ['CANCELLED', 'DRAFT'] } }, select: { id: true, studentId: true, invoiceNumber: true, totalNgn: true, paidNgn: true, outstandingNgn: true, student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true, arm: true } } } }, items: { select: { description: true, amountNgn: true } } }, orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }] });
    const all = groupStudentBalances(bills);
    const summary = { studentsBilled: all.length, studentsOwing: all.filter(r => r.outstandingNgn > 0).length, fullyPaid: all.filter(r => r.outstandingNgn <= 0).length, unpaid: all.filter(r => r.outstandingNgn > 0 && r.paidNgn === 0).length, partlyPaid: all.filter(r => r.outstandingNgn > 0 && r.paidNgn > 0).length };
    const q = query.search.toLowerCase();
    const rows = all.filter(row => {
        const text = [row.name, row.admissionNumber, ...row.bills.map(b => b.invoiceNumber)].join(' ').toLowerCase();
        if (q && !q.split(/\s+/).every(word => text.includes(word)))
            return false;
        if (query.paymentState === 'paid')
            return row.outstandingNgn <= 0;
        if (query.paymentState === 'unpaid')
            return row.outstandingNgn > 0 && row.paidNgn === 0;
        if (query.paymentState === 'partial')
            return row.outstandingNgn > 0 && row.paidNgn > 0;
        return query.paymentState === 'all' || row.outstandingNgn > 0;
    });
    const totalPages = Math.max(1, Math.ceil(rows.length / query.pageSize)), page = Math.min(query.page, totalPages);
    return { items: rows.slice((page - 1) * query.pageSize, page * query.pageSize), summary, meta: { page, pageSize: query.pageSize, total: rows.length, totalPages } };
}
