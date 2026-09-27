import { Prisma } from "@prisma/client";

import { PIN_UNIT_PRICE_NGN } from "./constants";
import type { ListBillingQuery, RecordPaymentBody } from "./dto";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../common/errors/AppError";

export class PlatformBillingService {
  /** Platform-wide KPIs for the billing dashboard header. */
  async overview() {
    const [printedAgg, paymentAgg, schoolCounts] = await Promise.all([
      prisma.pin.aggregate({
        where: { printed: true },
        _count: { id: true },
      }),
      prisma.organizationPayment.aggregate({
        _sum: { amountNgn: true },
      }),
      prisma.organization.groupBy({
        by: ["isActive"],
        _count: { id: true },
      }),
    ]);

    const printedCards = printedAgg._count.id;
    const expectedRevenueNgn = printedCards * PIN_UNIT_PRICE_NGN;
    const collectedNgn = paymentAgg._sum.amountNgn ?? 0;
    const outstandingNgn = Math.max(0, expectedRevenueNgn - collectedNgn);

    const activeSchools = schoolCounts.find((g) => g.isActive)?._count.id ?? 0;
    const inactiveSchools =
      schoolCounts.find((g) => !g.isActive)?._count.id ?? 0;

    // Schools with at least one printed pin
    const schoolsWithPrinted = await prisma.pin.groupBy({
      by: ["organizationId"],
      where: { printed: true },
      _count: { id: true },
    });

    // How many of those have fully paid (need per-org: expensive if naive —
    // approximate "paying" = has at least one payment record)
    const schoolsWithPayment = await prisma.organizationPayment.groupBy({
      by: ["organizationId"],
    });

    return {
      unitPriceNgn: PIN_UNIT_PRICE_NGN,
      printedCards,
      totalPinsIssued: await prisma.pin.count(),
      expectedRevenueNgn,
      collectedNgn,
      outstandingNgn,
      collectionRate:
        expectedRevenueNgn > 0
          ? Math.round((collectedNgn / expectedRevenueNgn) * 1000) / 10
          : 0,
      schoolsWithPrintedCards: schoolsWithPrinted.length,
      schoolsWithPayments: schoolsWithPayment.length,
      activeSchools,
      totalSchools: activeSchools + inactiveSchools,
    };
  }

  /**
   * Per-school billing rows: printed = sold, expected = printed × ₦1000,
   * paid = sum(OrganizationPayment), breakdown by academic session.
   */
  async listSchools(query: ListBillingQuery) {
    const { q, page, limit } = query;
    const skip = (page - 1) * limit;

    const orgWhere: Prisma.OrganizationWhereInput = {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where: orgWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          state: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: Number(limit),
      }),
      prisma.organization.count({ where: orgWhere }),
    ]);

    if (orgs.length === 0) {
      return {
        items: [],
        meta: { page, limit, total, totalPages: 1 },
        unitPriceNgn: PIN_UNIT_PRICE_NGN,
      };
    }

    const orgIds = orgs.map((o) => o.id);

    // Printed + total pins per org
    const pinGroups = await prisma.pin.groupBy({
      by: ["organizationId", "printed"],
      where: { organizationId: { in: orgIds } },
      _count: { id: true },
    });

    // Pins with term → session for per-session breakdown (printed only)
    const printedPins = await prisma.pin.findMany({
      where: {
        organizationId: { in: orgIds },
        printed: true,
      },
      select: {
        organizationId: true,
        term: {
          select: {
            session: { select: { id: true, name: true } },
          },
        },
      },
    });

    const payments = await prisma.organizationPayment.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds } },
      _sum: { amountNgn: true },
    });

    const paidMap = new Map(
      payments.map((p) => [p.organizationId, p._sum.amountNgn ?? 0])
    );

    type PinKey = string;
    const pinCountMap = new Map<PinKey, { total: number; printed: number }>();
    for (const g of pinGroups) {
      const cur = pinCountMap.get(g.organizationId) ?? {
        total: 0,
        printed: 0,
      };
      cur.total += g._count.id;
      if (g.printed) cur.printed += g._count.id;
      pinCountMap.set(g.organizationId, cur);
    }

    // session breakdown: orgId -> sessionName -> count
    const sessionMap = new Map<string, Map<string, number>>();
    for (const p of printedPins) {
      const sid = p.organizationId;
      const sessionName = p.term.session.name;
      if (!sessionMap.has(sid)) sessionMap.set(sid, new Map());
      const m = sessionMap.get(sid)!;
      m.set(sessionName, (m.get(sessionName) ?? 0) + 1);
    }

    const items = orgs.map((org) => {
      const counts = pinCountMap.get(org.id) ?? { total: 0, printed: 0 };
      const amountPaidNgn = paidMap.get(org.id) ?? 0;
      const expectedNgn = counts.printed * PIN_UNIT_PRICE_NGN;
      const balanceNgn = expectedNgn - amountPaidNgn;

      let status: "PAID" | "PARTIAL" | "UNPAID" | "NO_SALES" = "NO_SALES";
      if (counts.printed === 0) status = "NO_SALES";
      else if (amountPaidNgn <= 0) status = "UNPAID";
      else if (balanceNgn <= 0) status = "PAID";
      else status = "PARTIAL";

      const bySession = [...(sessionMap.get(org.id) ?? new Map()).entries()]
        .map(([sessionName, printedCards]) => ({
          sessionName,
          printedCards,
          expectedNgn: printedCards * PIN_UNIT_PRICE_NGN,
        }))
        .sort((a, b) => a.sessionName.localeCompare(b.sessionName));

      return {
        organizationId: org.id,
        name: org.name,
        slug: org.slug,
        city: org.city,
        state: org.state,
        isActive: org.isActive,
        totalCards: counts.total,
        printedCards: counts.printed,
        unitPriceNgn: PIN_UNIT_PRICE_NGN,
        expectedNgn,
        amountPaidNgn,
        balanceNgn,
        status,
        bySession,
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      unitPriceNgn: PIN_UNIT_PRICE_NGN,
    };
  }

  async recordPayment(
    organizationId: string,
    body: RecordPaymentBody,
    recordedById?: string
  ) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new AppError(404, "School not found");

    const payment = await prisma.organizationPayment.create({
      data: {
        organizationId,
        amountNgn: body.amountNgn,
        note: body.note ?? null,
        paidAt: body.paidAt ?? new Date(),
        recordedById: recordedById ?? null,
      },
      select: {
        id: true,
        amountNgn: true,
        note: true,
        paidAt: true,
        createdAt: true,
      },
    });

    return payment;
  }

  async listPayments(organizationId: string) {
    return prisma.organizationPayment.findMany({
      where: { organizationId },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amountNgn: true,
        note: true,
        paidAt: true,
        createdAt: true,
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
