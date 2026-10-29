"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = exports.DashboardService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const attendance_service_1 = require("../attendance/attendance.service");
const fees_service_1 = require("../fees/fees.service");
const results_service_1 = require("../results/results.service");
class DashboardService {
    /**
     * Core school home metrics — the numbers every principal/proprietor wants
     * on first load.
     */
    async schoolHome(organizationId, permissions) {
        const can = (permission) => permissions.includes(permission);
        const todayStr = new Date().toISOString().slice(0, 10);
        const currentTerm = await prisma_1.prisma.term.findFirst({ where: { isCurrent: true, session: { organizationId } }, select: { id: true } });
        const financeAllowed = can("fees:read") && can("payments:read");
        const [students, teachers, staff, parents, classes, attendance, finance, absent, results, pendingPayments] = await Promise.all([
            can("students:read") ? prisma_1.prisma.student.count({ where: { organizationId, isActive: true } }) : undefined,
            can("staff:read") ? prisma_1.prisma.membership.count({ where: { organizationId, OR: [{ role: "TEACHER" }, { roles: { has: "TEACHER" } }], isActive: true } }) : undefined,
            can("staff:read") ? prisma_1.prisma.membership.count({ where: { organizationId, isActive: true, role: { not: "PARENT" } } }) : undefined,
            can("parents:read") ? prisma_1.prisma.parent.count({ where: { organizationId, isActive: true } }) : undefined,
            can("classes:read") ? prisma_1.prisma.class.count({ where: { organizationId, isActive: true } }) : undefined,
            can("attendance:read") ? attendance_service_1.attendanceService.attendancePercentage(organizationId, { from: todayStr, to: todayStr }) : undefined,
            financeAllowed ? (currentTerm ? fees_service_1.feesService.bursarSummary(organizationId, { termId: currentTerm.id }) : { billedNgn: 0, collectedNgn: 0, outstandingNgn: 0, invoicesWithBalance: 0 }) : undefined,
            can("attendance:read") ? attendance_service_1.attendanceService.absentToday(organizationId, todayStr) : undefined,
            can("results:read") ? this.incompleteResultSheets(organizationId) : undefined,
            can("payments:read") ? prisma_1.prisma.payment.count({ where: { organizationId, status: "PENDING", source: "PAYSTACK" } }) : undefined,
        ]);
        return {
            ...(students !== undefined ? { students } : {}), ...(teachers !== undefined ? { teachers } : {}),
            ...(staff !== undefined ? { staff } : {}), ...(parents !== undefined ? { parents } : {}), ...(classes !== undefined ? { classes } : {}),
            currentTermId: currentTerm?.id ?? null,
            ...(attendance ? { attendance: { percentage: attendance.percentage, present: attendance.present, total: attendance.total } } : {}),
            ...(finance ? { finance: { billedNgn: finance.billedNgn, collectedNgn: finance.collectedNgn, outstandingNgn: finance.outstandingNgn, invoicesWithBalance: finance.invoicesWithBalance } } : {}),
            attention: {
                ...(absent ? { absentToday: absent.slice(0, 12), absentCount: absent.length } : {}),
                ...(results ? { incompleteResults: results.count } : {}),
                ...(pendingPayments !== undefined ? { pendingPayments } : {}),
            }, generatedAt: new Date().toISOString(),
        };
    }
    async incompleteResultSheets(organizationId) {
        // Find current term if possible
        const currentTerm = await prisma_1.prisma.term.findFirst({
            where: { isCurrent: true, session: { organizationId } },
            select: { id: true },
        });
        const where = {
            organizationId,
            status: { in: ["DRAFT", "SUBMITTED"] },
        };
        if (currentTerm)
            where.termId = currentTerm.id;
        const count = await prisma_1.prisma.result.count({ where });
        return { count };
    }
    /**
     * Lightweight class-level snapshot (useful for principal view)
     */
    async classSnapshot(organizationId, classId, permissions) {
        const cls = await prisma_1.prisma.class.findFirst({
            where: { id: classId, organizationId },
            select: { id: true, name: true, arm: true },
        });
        if (!cls)
            throw new errors_1.AppError(404, "CLASS_NOT_FOUND", "Class not found");
        const todayStr = new Date().toISOString().slice(0, 10);
        const [students, attendance, outstanding] = await Promise.all([
            prisma_1.prisma.student.count({
                where: { organizationId, classId, isActive: true },
            }),
            permissions.includes("attendance:read") ? attendance_service_1.attendanceService.attendancePercentage(organizationId, {
                from: todayStr, to: todayStr, classId,
            }) : undefined,
            permissions.includes("fees:read") && permissions.includes("payments:read") ? prisma_1.prisma.invoice.aggregate({
                where: {
                    organizationId,
                    student: { classId },
                    outstandingNgn: { gt: 0 },
                    status: { not: "CANCELLED" },
                },
                _sum: { outstandingNgn: true },
                _count: true,
            }) : undefined,
        ]);
        return {
            class: cls,
            students,
            ...(attendance ? { attendance } : {}),
            ...(outstanding ? { outstandingNgn: outstanding._sum.outstandingNgn ?? 0, invoicesWithBalance: outstanding._count } : {}),
        };
    }
    // ─── Exports (JSON or CSV-ready rows) ──────────────────────────
    async exportData(organizationId, opts) {
        switch (opts.type) {
            case "students":
                return this.exportStudents(organizationId, opts.classId);
            case "attendance":
                return this.exportAttendance(organizationId, opts);
            case "results":
                return this.exportResults(organizationId, opts);
            case "invoices":
                return this.exportInvoices(organizationId, opts);
            case "payments":
                return this.exportPayments(organizationId, opts);
            default:
                throw new errors_1.AppError(400, "INVALID_TYPE", "Unknown export type");
        }
    }
    async exportStudents(organizationId, classId) {
        const students = await prisma_1.prisma.student.findMany({
            where: {
                organizationId,
                isActive: true,
                ...(classId ? { classId } : {}),
            },
            include: {
                class: { select: { name: true, arm: true } },
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
        return students.map((s) => ({
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            otherNames: s.otherNames ?? "",
            gender: s.gender ?? "",
            class: s.class
                ? `${s.class.name}${s.class.arm ? " " + s.class.arm : ""}`
                : "",
            parentPhone: s.parentPhone ?? "",
            parentEmail: s.parentEmail ?? "",
        }));
    }
    async exportAttendance(organizationId, opts) {
        const where = { organizationId };
        if (opts.classId)
            where.classId = opts.classId;
        if (opts.from || opts.to) {
            where.date = {};
            if (opts.from)
                where.date.gte = new Date(opts.from);
            if (opts.to)
                where.date.lte = new Date(opts.to);
        }
        const rows = await prisma_1.prisma.attendanceRecord.findMany({
            where,
            include: {
                student: {
                    select: { admissionNumber: true, firstName: true, lastName: true },
                },
                class: { select: { name: true, arm: true } },
            },
            orderBy: [{ date: "desc" }, { student: { lastName: "asc" } }],
            take: 5000, // safety cap
        });
        return rows.map((r) => ({
            date: r.date.toISOString().slice(0, 10),
            admissionNumber: r.student.admissionNumber,
            studentName: `${r.student.lastName} ${r.student.firstName}`,
            class: r.class
                ? `${r.class.name}${r.class.arm ? " " + r.class.arm : ""}`
                : "",
            status: r.status,
            note: r.note ?? "",
        }));
    }
    async exportResults(organizationId, opts) {
        const where = { organizationId };
        if (opts.classId)
            where.classId = opts.classId;
        if (opts.termId)
            where.termId = opts.termId;
        const results = await prisma_1.prisma.result.findMany({
            where,
            include: {
                student: {
                    select: { admissionNumber: true, firstName: true, lastName: true },
                },
                term: { select: { name: true } },
                class: { select: { name: true, arm: true } },
                scores: { include: { subject: { select: { name: true } } } },
            },
            take: 2000,
        });
        // Flatten for CSV friendliness
        const rows = [];
        for (const r of results) {
            for (const score of r.scores) {
                rows.push({
                    admissionNumber: r.student.admissionNumber,
                    studentName: `${r.student.lastName} ${r.student.firstName}`,
                    class: r.class
                        ? `${r.class.name}${r.class.arm ? " " + r.class.arm : ""}`
                        : "",
                    term: r.term.name,
                    subject: score.subject.name,
                    ca1: score.ca1,
                    ca2: score.ca2,
                    exam: score.exam,
                    total: score.total,
                    grade: score.grade,
                    resultStatus: r.status,
                    isPublished: r.isPublished,
                });
            }
        }
        return rows;
    }
    async exportInvoices(organizationId, opts) {
        const where = { organizationId };
        if (opts.from || opts.to) {
            where.issuedAt = {};
            if (opts.from)
                where.issuedAt.gte = new Date(opts.from);
            if (opts.to)
                where.issuedAt.lte = new Date(opts.to);
        }
        const invoices = await prisma_1.prisma.invoice.findMany({
            where,
            include: {
                student: {
                    select: { admissionNumber: true, firstName: true, lastName: true },
                },
            },
            orderBy: { issuedAt: "desc" },
            take: 5000,
        });
        return invoices.map((i) => ({
            invoiceNumber: i.invoiceNumber,
            admissionNumber: i.student.admissionNumber,
            studentName: `${i.student.lastName} ${i.student.firstName}`,
            totalNgn: i.totalNgn,
            paidNgn: i.paidNgn,
            outstandingNgn: i.outstandingNgn,
            status: i.status,
            issuedAt: i.issuedAt.toISOString().slice(0, 10),
            dueDate: i.dueDate?.toISOString().slice(0, 10) ?? "",
        }));
    }
    async exportPayments(organizationId, opts) {
        const where = { organizationId };
        if (opts.from || opts.to) {
            where.paidAt = {};
            if (opts.from)
                where.paidAt.gte = new Date(opts.from);
            if (opts.to)
                where.paidAt.lte = new Date(opts.to);
        }
        const payments = await prisma_1.prisma.payment.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 5000,
        });
        return payments.map((p) => ({
            id: p.id,
            amountNgn: p.amountNgn,
            status: p.status,
            method: p.method,
            source: p.source,
            providerReference: p.providerReference ?? "",
            paidAt: p.paidAt?.toISOString() ?? "",
            note: p.note ?? "",
        }));
    }
    // ─── PDF data endpoints (reuse earlier payloads) ───────────────
    async reportCardData(organizationId, resultId, auth) {
        return results_service_1.resultsService.reportCardPayload(organizationId, resultId, auth);
    }
    async receiptData(organizationId, receiptId) {
        return fees_service_1.feesService.getReceipt(organizationId, receiptId);
    }
    // ─── Audit log list ────────────────────────────────────────────
    async listAuditLogs(organizationId, query) {
        const where = { organizationId };
        if (query.action)
            where.action = query.action;
        if (query.actorId)
            where.actorId = query.actorId;
        if (query.from || query.to) {
            where.createdAt = {};
            if (query.from)
                where.createdAt.gte = new Date(query.from);
            if (query.to)
                where.createdAt.lte = new Date(query.to);
        }
        return prisma_1.prisma.auditLog.findMany({
            where,
            take: query.limit ?? 50,
            ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
            orderBy: { createdAt: "desc" },
            include: {
                actor: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            },
        });
    }
}
exports.DashboardService = DashboardService;
exports.dashboardService = new DashboardService();
