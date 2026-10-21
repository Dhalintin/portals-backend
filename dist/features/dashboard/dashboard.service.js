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
    async schoolHome(organizationId) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const todayStr = today.toISOString().slice(0, 10);
        const [studentCount, activeTeachers, attendanceToday, feeSummary, absentToday, incompleteResults, pendingPayments,] = await Promise.all([
            // 1. Students
            prisma_1.prisma.student.count({
                where: { organizationId, isActive: true },
            }),
            // 2. Teachers (users with TEACHER membership)
            prisma_1.prisma.membership.count({
                where: { organizationId, role: "TEACHER", isActive: true },
            }),
            // 3. Attendance % today
            attendance_service_1.attendanceService.attendancePercentage(organizationId, {
                from: todayStr,
                to: todayStr,
            }),
            // 4. Fees collected / outstanding
            fees_service_1.feesService.bursarSummary(organizationId),
            // 5. Who is absent today
            attendance_service_1.attendanceService.absentToday(organizationId, todayStr),
            // 6. Result sheets still in DRAFT or SUBMITTED for current term
            this.incompleteResultSheets(organizationId),
            // 7. Payments that need attention (PENDING online)
            prisma_1.prisma.payment.count({
                where: { organizationId, status: "PENDING", source: "PAYSTACK" },
            }),
        ]);
        return {
            students: studentCount,
            teachers: activeTeachers,
            attendance: {
                percentage: attendanceToday.percentage,
                present: attendanceToday.present,
                total: attendanceToday.total,
            },
            finance: {
                collectedNgn: feeSummary.collectedNgn,
                outstandingNgn: feeSummary.outstandingNgn,
                invoicesWithBalance: feeSummary.invoicesWithBalance,
            },
            attention: {
                absentToday: absentToday.slice(0, 12), // first 12 for the card
                absentCount: absentToday.length,
                incompleteResults: incompleteResults.count,
                pendingPayments,
            },
            // Quick links the frontend can use
            generatedAt: new Date().toISOString(),
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
    async classSnapshot(organizationId, classId) {
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
            attendance_service_1.attendanceService.attendancePercentage(organizationId, {
                from: todayStr,
                to: todayStr,
                classId,
            }),
            prisma_1.prisma.invoice.aggregate({
                where: {
                    organizationId,
                    student: { classId },
                    outstandingNgn: { gt: 0 },
                    status: { not: "CANCELLED" },
                },
                _sum: { outstandingNgn: true },
                _count: true,
            }),
        ]);
        return {
            class: cls,
            students,
            attendance,
            outstandingNgn: outstanding._sum.outstandingNgn ?? 0,
            invoicesWithBalance: outstanding._count,
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
