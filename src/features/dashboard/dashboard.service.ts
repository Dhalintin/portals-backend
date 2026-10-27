import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { attendanceService } from "../attendance/attendance.service";
import { feesService } from "../fees/fees.service";
import { resultsService } from "../results/results.service";

export class DashboardService {
  /**
   * Core school home metrics — the numbers every principal/proprietor wants
   * on first load.
   */
  async schoolHome(organizationId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const currentTerm = await prisma.term.findFirst({where:{isCurrent:true,session:{organizationId}},select:{id:true}});
    const [
      studentCount,
      activeTeachers,
      attendanceToday,
      feeSummary,
      absentToday,
      incompleteResults,
      pendingPayments,
      staffCount, parentCount, classCount,
    ] = await Promise.all([
      // 1. Students
      prisma.student.count({
        where: { organizationId, isActive: true },
      }),

      // 2. Teachers (users with TEACHER membership)
      prisma.membership.count({
        where: { organizationId, role: "TEACHER", isActive: true },
      }),

      // 3. Attendance % today
      attendanceService.attendancePercentage(organizationId, {
        from: todayStr,
        to: todayStr,
      }),

      // 4. Fees collected / outstanding
      currentTerm ? feesService.bursarSummary(organizationId,{termId:currentTerm.id}) : Promise.resolve({collectedNgn:0,outstandingNgn:0,invoicesWithBalance:0,billedNgn:0}),

      // 5. Who is absent today
      attendanceService.absentToday(organizationId, todayStr),

      // 6. Result sheets still in DRAFT or SUBMITTED for current term
      this.incompleteResultSheets(organizationId),

      // 7. Payments that need attention (PENDING online)
      prisma.payment.count({
        where: { organizationId, status: "PENDING", source: "PAYSTACK" },
      }),
      prisma.membership.count({where:{organizationId,isActive:true,role:{not:"PARENT"}}}),
      prisma.parent.count({where:{organizationId,isActive:true}}),
      prisma.class.count({where:{organizationId,isActive:true}}),
    ]);

    return {
      students: studentCount,
      teachers: activeTeachers,
      staff: staffCount, parents: parentCount, classes: classCount, currentTermId: currentTerm?.id ?? null,
      attendance: {
        percentage: attendanceToday.percentage,
        present: attendanceToday.present,
        total: attendanceToday.total,
      },
      finance: {
        billedNgn: feeSummary.billedNgn,
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

  private async incompleteResultSheets(organizationId: string) {
    // Find current term if possible
    const currentTerm = await prisma.term.findFirst({
      where: { isCurrent: true, session: { organizationId } },
      select: { id: true },
    });

    const where: Prisma.ResultWhereInput = {
      organizationId,
      status: { in: ["DRAFT", "SUBMITTED"] },
    };
    if (currentTerm) where.termId = currentTerm.id;

    const count = await prisma.result.count({ where });
    return { count };
  }

  /**
   * Lightweight class-level snapshot (useful for principal view)
   */
  async classSnapshot(organizationId: string, classId: string) {
    const cls = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: { id: true, name: true, arm: true },
    });
    if (!cls) throw new AppError(404, "CLASS_NOT_FOUND", "Class not found");

    const todayStr = new Date().toISOString().slice(0, 10);

    const [students, attendance, outstanding] = await Promise.all([
      prisma.student.count({
        where: { organizationId, classId, isActive: true },
      }),
      attendanceService.attendancePercentage(organizationId, {
        from: todayStr,
        to: todayStr,
        classId,
      }),
      prisma.invoice.aggregate({
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
  async exportData(
    organizationId: string,
    opts: {
      type: "students" | "attendance" | "results" | "invoices" | "payments";
      classId?: string;
      termId?: string;
      from?: string;
      to?: string;
    }
  ) {
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
        throw new AppError(400, "INVALID_TYPE", "Unknown export type");
    }
  }

  private async exportStudents(organizationId: string, classId?: string) {
    const students = await prisma.student.findMany({
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

  private async exportAttendance(
    organizationId: string,
    opts: { classId?: string; from?: string; to?: string }
  ) {
    const where: Prisma.AttendanceRecordWhereInput = { organizationId };
    if (opts.classId) where.classId = opts.classId;
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(opts.from);
      if (opts.to) where.date.lte = new Date(opts.to);
    }

    const rows = await prisma.attendanceRecord.findMany({
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

  private async exportResults(
    organizationId: string,
    opts: { classId?: string; termId?: string }
  ) {
    const where: Prisma.ResultWhereInput = { organizationId };
    if (opts.classId) where.classId = opts.classId;
    if (opts.termId) where.termId = opts.termId;

    const results = await prisma.result.findMany({
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
    const rows: any[] = [];
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

  private async exportInvoices(
    organizationId: string,
    opts: { from?: string; to?: string }
  ) {
    const where: Prisma.InvoiceWhereInput = { organizationId };
    if (opts.from || opts.to) {
      where.issuedAt = {};
      if (opts.from) where.issuedAt.gte = new Date(opts.from);
      if (opts.to) where.issuedAt.lte = new Date(opts.to);
    }

    const invoices = await prisma.invoice.findMany({
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

  private async exportPayments(
    organizationId: string,
    opts: { from?: string; to?: string }
  ) {
    const where: Prisma.PaymentWhereInput = { organizationId };
    if (opts.from || opts.to) {
      where.paidAt = {};
      if (opts.from) where.paidAt.gte = new Date(opts.from);
      if (opts.to) where.paidAt.lte = new Date(opts.to);
    }

    const payments = await prisma.payment.findMany({
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
  async reportCardData(organizationId: string, resultId: string, auth?: import("../../auth/types").AuthContext) {
    return resultsService.reportCardPayload(organizationId, resultId, auth);
  }

  async receiptData(organizationId: string, receiptId: string) {
    return feesService.getReceipt(organizationId, receiptId);
  }

  // ─── Audit log list ────────────────────────────────────────────
  async listAuditLogs(
    organizationId: string,
    query: {
      action?: string;
      actorId?: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    }
  ) {
    const where: Prisma.AuditLogWhereInput = { organizationId };

    if (query.action) where.action = query.action as any;
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    return prisma.auditLog.findMany({
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

export const dashboardService = new DashboardService();
