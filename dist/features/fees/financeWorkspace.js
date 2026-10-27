"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentPaymentSchema = exports.financeTermQuery = void 0;
exports.financeWorkspace = financeWorkspace;
exports.staffReceiptDocument = staffReceiptDocument;
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const studentBalances_1 = require("./studentBalances");
exports.financeTermQuery = zod_1.z.object({ termId: zod_1.z.string().uuid() });
exports.studentPaymentSchema = zod_1.z.object({
    idempotencyKey: zod_1.z.string().uuid(), studentId: zod_1.z.string().uuid(), termId: zod_1.z.string().uuid(),
    amountNgn: zod_1.z.number().int().positive().max(2147483647),
    method: zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'POS', 'OTHER']),
    note: zod_1.z.string().trim().max(500).optional(), paidAt: zod_1.z.string().datetime(),
    bills: zod_1.z.array(zod_1.z.object({ invoiceId: zod_1.z.string().uuid(), balanceNgn: zod_1.z.number().int().positive() }).strict()).min(1).max(200),
}).strict().refine(input => new Set(input.bills.map(bill => bill.invoiceId)).size === input.bills.length, 'Select each bill once');
async function financeWorkspace(organizationId, raw) {
    const { termId } = exports.financeTermQuery.parse(raw);
    return prisma_1.prisma.$transaction(async (tx) => {
        const term = await tx.term.findFirst({ where: { id: termId, session: { organizationId } }, include: { session: true } });
        if (!term)
            throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
        const invoices = await tx.invoice.findMany({
            where: { organizationId, termId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
            select: { id: true, studentId: true, invoiceNumber: true, totalNgn: true, paidNgn: true, outstandingNgn: true,
                student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true, arm: true } } } },
                items: { select: { id: true, description: true, amountNgn: true } },
                receipts: { select: { id: true, receiptNumber: true, amountNgn: true, issuedAt: true, voidedAt: true } },
                allocations: { where: { reversedAt: null, payment: { status: 'SUCCESSFUL' } }, select: { amountNgn: true, payment: { select: { paidAt: true } } } },
            }, orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
        });
        const payments = await tx.payment.findMany({ where: { organizationId, status: 'SUCCESSFUL' },
            select: { id: true, amountNgn: true, paidAt: true, method: true, providerReference: true, providerPayload: true,
                allocations: { where: { reversedAt: null }, select: { amountNgn: true, invoice: { select: { studentId: true } } } },
                receipts: { where: { voidedAt: null }, select: { id: true, receiptNumber: true, amountNgn: true } },
            }, orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
        });
        const credits = payments.flatMap(payment => {
            const creditNgn = payment.amountNgn - payment.allocations.reduce((sum, allocation) => sum + allocation.amountNgn, 0);
            if (creditNgn <= 0)
                return [];
            const ids = [...new Set(payment.allocations.map(allocation => allocation.invoice.studentId))];
            const payload = payment.providerPayload;
            const studentId = typeof payload?.studentId === 'string' ? payload.studentId : ids.length === 1 ? ids[0] : null;
            return [{ paymentId: payment.id, studentId, creditNgn, paidAt: payment.paidAt, method: payment.method,
                    reference: payment.providerReference ?? payment.id, receipts: payment.receipts }];
        });
        const creditStudentIds = [...new Set(credits.flatMap(credit => credit.studentId ? [credit.studentId] : []))];
        const creditStudents = await tx.student.findMany({ where: { organizationId, id: { in: creditStudentIds } }, select: { id: true, firstName: true, lastName: true, admissionNumber: true } });
        const receiptsByInvoice = new Map(invoices.map(invoice => [invoice.id, invoice.receipts]));
        const studentsById = new Map(creditStudents.map(student => [student.id, student]));
        const students = (0, studentBalances_1.groupStudentBalances)(invoices).map(row => ({ ...row,
            bills: row.bills.map(bill => ({ ...bill, receipts: receiptsByInvoice.get(bill.id) })),
        }));
        const totals = invoices.reduce((sum, bill) => ({ expectedNgn: sum.expectedNgn + bill.totalNgn, receivedNgn: sum.receivedNgn + bill.paidNgn, outstandingNgn: sum.outstandingNgn + bill.outstandingNgn }), { expectedNgn: 0, receivedNgn: 0, outstandingNgn: 0 });
        const classes = new Map();
        for (const student of students) {
            const current = classes.get(student.className) ?? { name: student.className, expectedNgn: 0, receivedNgn: 0, outstandingNgn: 0 };
            current.expectedNgn += student.totalNgn;
            current.receivedNgn += student.paidNgn;
            current.outstandingNgn += student.outstandingNgn;
            classes.set(student.className, current);
        }
        const days = new Map();
        for (let offset = 13; offset >= 0; offset--)
            days.set(new Date(Date.now() + 3600000 - offset * 86400000).toISOString().slice(0, 10), 0);
        for (const invoice of invoices)
            for (const allocation of invoice.allocations) {
                if (!allocation.payment.paidAt)
                    continue;
                const day = new Date(allocation.payment.paidAt.getTime() + 3600000).toISOString().slice(0, 10);
                if (days.has(day))
                    days.set(day, days.get(day) + allocation.amountNgn);
            }
        return { generatedAt: new Date().toISOString(), term: { id: term.id, name: term.name, sessionName: term.session.name },
            totals: { ...totals, studentsBilled: students.length, fullyPaid: students.filter(row => row.outstandingNgn === 0).length, partlyPaid: students.filter(row => row.paidNgn > 0 && row.outstandingNgn > 0).length, unpaid: students.filter(row => row.paidNgn === 0 && row.outstandingNgn > 0).length, schoolCreditNgn: credits.reduce((sum, row) => sum + row.creditNgn, 0) },
            students, classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name)), daily: [...days].map(([date, amountNgn]) => ({ date, amountNgn })),
            credits: credits.map(row => { const student = row.studentId ? studentsById.get(row.studentId) : undefined; return { ...row, name: student ? [student.lastName, student.firstName].join(', ') : 'Unassigned payment — review required', admissionNumber: student?.admissionNumber ?? '' }; }),
        };
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
async function staffReceiptDocument(organizationId, id) {
    const receipt = await prisma_1.prisma.receipt.findFirst({ where: { id, organizationId }, include: { organization: { select: { name: true } }, payment: true, invoice: { include: { student: true, term: { include: { session: true } } } } } });
    if (!receipt)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Receipt not found');
    const studentId = receipt.payment.providerPayload?.studentId;
    const student = receipt.invoice?.student ?? (typeof studentId === 'string' ? await prisma_1.prisma.student.findFirst({ where: { id: studentId, organizationId } }) : null);
    return { id: receipt.id, receiptNumber: receipt.receiptNumber, amountNgn: receipt.amountNgn, issuedAt: receipt.issuedAt, voidedAt: receipt.voidedAt, items: receipt.items, schoolName: receipt.organization.name,
        student: student && { firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber },
        payment: { method: receipt.payment.method, reference: receipt.payment.providerReference ?? receipt.payment.id, status: receipt.payment.status },
        invoice: receipt.invoice && { invoiceNumber: receipt.invoice.invoiceNumber, outstandingNgn: receipt.invoice.outstandingNgn, term: receipt.invoice.term },
    };
}
