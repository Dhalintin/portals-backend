import { GlobalRole, OrgRole, PinStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import {
  generatePinCode,
  maskPinCode,
  normalizePinCode,
} from "../pins/pins.codes";
import type {
  AssignSchoolsBody,
  CreatePlatformAdminBody,
  GeneratePinsForSchoolBody,
  ListSchoolsQuery,
  MarkPinsPrintedBody,
} from "./platform-admin.dto";
import bcrypt from "bcryptjs";

type Actor = {
  userId: string;
  globalRole: GlobalRole | string;
};

function assertPlatformStaff(actor: Actor) {
  if (
    actor.globalRole !== GlobalRole.SUPER_ADMIN &&
    actor.globalRole !== GlobalRole.PLATFORM_ADMIN
  ) {
    throw new ForbiddenError("Platform staff only");
  }
}

function assertSuperAdmin(actor: Actor) {
  if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
    throw new ForbiddenError("Super admin only");
  }
}

/** Bound IN-lists for platform admins (assignments stay small) */
const MAX_ASSIGNED_ORGS = 500;

export class PlatformAdminService {
  private async accessibleOrgIds(actor: Actor): Promise<string[] | "all"> {
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) return "all";

    const rows = await prisma.platformAdminAssignment.findMany({
      where: { userId: actor.userId },
      select: { organizationId: true },
      take: Number(MAX_ASSIGNED_ORGS),
    });
    return rows.map((r) => r.organizationId);
  }

  async assertCanAccessOrg(actor: Actor, organizationId: string) {
    assertPlatformStaff(actor);
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) return;

    const hit = await prisma.platformAdminAssignment.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.userId,
          organizationId,
        },
      },
      select: { id: true },
    });
    if (!hit) throw new ForbiddenError("School is not assigned to you");
  }

  // ─── Schools ─────────────────────────────────────────────────────────────

  /**
   * Scalable list: 1 count + 1 page query + a few groupBy over *only those org ids*
   * (not N+1 per school).
   */
  async listSchools(actor: Actor, query: ListSchoolsQuery) {
    assertPlatformStaff(actor);
    const scope = await this.accessibleOrgIds(actor);

    if (scope !== "all" && scope.length === 0) {
      return {
        items: [],
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const where: Prisma.OrganizationWhereInput = {
      ...(scope === "all" ? {} : { id: { in: scope } }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { slug: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.isActive === "true"
        ? { isActive: true }
        : query.isActive === "false"
        ? { isActive: false }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: Number(query.pageSize),
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          isActive: true,
          onBoarded: true,
          logoUrl: true,
          primaryColor: true,
          accentColor: true,
          createdAt: true,
        },
      }),
    ]);

    const orgIds = rows.map((r) => r.id);
    if (orgIds.length === 0) {
      return {
        items: [],
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize) || 0,
        },
      };
    }

    // Batch stats — fixed number of queries regardless of page size
    const [studentGroups, pinGroups, currentTerms] = await Promise.all([
      prisma.student.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: orgIds }, isActive: true },
        _count: { _all: true },
      }),
      prisma.pin.groupBy({
        by: ["organizationId", "status"],
        where: {
          organizationId: { in: orgIds },
          status: { in: [PinStatus.UNUSED, PinStatus.USED] },
        },
        _count: { _all: true },
      }),
      // Current term per org via sessions marked current
      prisma.term.findMany({
        where: {
          isCurrent: true,
          session: {
            isCurrent: true,
            organizationId: { in: orgIds },
          },
        },
        select: {
          id: true,
          name: true,
          session: {
            select: { organizationId: true, name: true },
          },
        },
      }),
    ]);

    // Publish signal from Results (Term has no isPublished)
    const termIds = currentTerms.map((t) => t.id);
    const publishByTerm =
      termIds.length === 0
        ? []
        : await prisma.result.groupBy({
            by: ["termId", "isPublished"],
            where: { termId: { in: termIds } },
            _count: { _all: true },
          });

    const studentsByOrg = new Map(
      studentGroups.map((g) => [g.organizationId, g._count._all])
    );
    const pinsUnusedByOrg = new Map<string, number>();
    const pinsUsedByOrg = new Map<string, number>();
    for (const g of pinGroups) {
      if (g.status === PinStatus.UNUSED) {
        pinsUnusedByOrg.set(g.organizationId, g._count._all);
      } else if (g.status === PinStatus.USED) {
        pinsUsedByOrg.set(g.organizationId, g._count._all);
      }
    }

    const termByOrg = new Map(
      currentTerms.map((t) => [
        t.session.organizationId,
        { id: t.id, name: t.name, sessionName: t.session.name },
      ])
    );

    const publishedByTermId = new Map<string, number>();
    const draftByTermId = new Map<string, number>();
    for (const g of publishByTerm) {
      if (g.isPublished) publishedByTermId.set(g.termId, g._count._all);
      else draftByTermId.set(g.termId, g._count._all);
    }

    const items = rows.map((org) => {
      const term = termByOrg.get(org.id) ?? null;
      const published = term ? publishedByTermId.get(term.id) ?? 0 : 0;
      const draft = term ? draftByTermId.get(term.id) ?? 0 : 0;
      // "Term published" ≈ any results published (or all non-draft if you prefer)
      const isPublished =
        published > 0 && draft === 0 && published + draft > 0
          ? true
          : published > 0;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        city: org.city,
        state: org.state,
        isActive: org.isActive,
        onBoarded: org.onBoarded,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
        createdAt: org.createdAt,
        stats: {
          activeStudents: studentsByOrg.get(org.id) ?? 0,
          pinsUnused: pinsUnusedByOrg.get(org.id) ?? 0,
          pinsUsed: pinsUsedByOrg.get(org.id) ?? 0,
        },
        currentTerm: term
          ? {
              id: term.id,
              name: term.name,
              sessionName: term.sessionName,
              /** Derived from Result.isPublished — not a Term column */
              resultsPublished: published,
              resultsDraft: draft,
              isPublished,
            }
          : null,
      };
    });

    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize) || 0,
      },
    };
  }

  async getSchoolDetail(actor: Actor, organizationId: string) {
    await this.assertCanAccessOrg(actor, organizationId);

    const [org, activeStudents, classes, subjects, sessions, pinStats] =
      await Promise.all([
        prisma.organization.findFirst({
          where: { id: organizationId },
          include: {
            site: true,
            memberships: {
              where: { role: OrgRole.SCHOOL_ADMIN, isActive: true },
              take: 10,
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        }),
        prisma.student.count({
          where: { organizationId, isActive: true },
        }),
        prisma.class.count({
          where: { organizationId, isActive: true },
        }),
        prisma.subject.count({
          where: { organizationId, isActive: true },
        }),
        prisma.academicSession.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            terms: {
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                isCurrent: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        }),
        prisma.pin.groupBy({
          by: ["status"],
          where: { organizationId },
          _count: { _all: true },
        }),
      ]);

    if (!org) throw new NotFoundError("School not found");

    const pinsByStatus = Object.fromEntries(
      pinStats.map((p) => [p.status, p._count._all])
    ) as Record<string, number>;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      state: org.state,
      country: org.country,
      motto: org.motto,
      schoolType: org.schoolType,
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
      accentColor: org.accentColor,
      isActive: org.isActive,
      onBoarded: org.onBoarded,
      createdAt: org.createdAt,
      site: org.site,
      schoolAdmins: org.memberships.map((m) => ({
        membershipId: m.id,
        role: m.role,
        user: m.user,
      })),
      stats: {
        activeStudents,
        classes,
        subjects,
        pins: {
          unused: pinsByStatus[PinStatus.UNUSED] ?? 0,
          used: pinsByStatus[PinStatus.USED] ?? 0,
          disabled: pinsByStatus[PinStatus.DISABLED] ?? 0,
          expired: pinsByStatus[PinStatus.EXPIRED] ?? 0,
          total: Object.values(pinsByStatus).reduce((a, b) => a + b, 0),
        },
      },
      recentSessions: sessions,
    };
  }

  async setSchoolActive(
    actor: Actor,
    organizationId: string,
    isActive: boolean
  ) {
    assertSuperAdmin(actor);
    return prisma.organization.update({
      where: { id: organizationId },
      data: { isActive },
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }

  // ─── PIN cards ───────────────────────────────────────────────────────────

  /**
   * Batch generate: pre-build unique codes, createMany in chunks.
   * Avoids per-row sequential inserts inside one long transaction.
   */
  async generatePinsForSchool(
    actor: Actor,
    organizationId: string,
    body: GeneratePinsForSchoolBody
  ) {
    await this.assertCanAccessOrg(actor, organizationId);

    const term = await prisma.term.findFirst({
      where: {
        id: body.termId,
        session: { organizationId },
      },
      select: {
        id: true,
        name: true,
        session: { select: { name: true } },
      },
    });
    if (!term) throw new NotFoundError("Term not found for this school");

    const quantity = body.quantity;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    // Generate more codes than needed to absorb rare collisions
    const codeSet = new Set<string>();
    let guard = 0;
    while (codeSet.size < quantity && guard < quantity * 5) {
      codeSet.add(normalizePinCode(generatePinCode()));
      guard++;
    }
    if (codeSet.size < quantity) {
      throw new BadRequestError("Could not generate enough unique PIN codes");
    }

    const codes = [...codeSet].slice(0, quantity);
    const CHUNK = 100;
    const created: Array<{
      id: string;
      serial: string;
      code: string;
      status: PinStatus;
      termId: string;
      createdAt: Date;
    }> = [];

    for (let i = 0; i < codes.length; i += CHUNK) {
      const slice = codes.slice(i, i + CHUNK);
      // Short transaction per chunk
      const batch = await prisma.$transaction(async (tx) => {
        const rows = await Promise.all(
          slice.map((code) =>
            tx.pin.create({
              data: {
                code,
                organizationId,
                termId: body.termId,
                status: PinStatus.UNUSED,
                expiresAt,
              },
              select: {
                id: true,
                code: true,
                status: true,
                termId: true,
                createdAt: true,
              },
            })
          )
        );
        return rows;
      });

      for (const pin of batch) {
        created.push({
          id: pin.id,
          serial: pin.id,
          code: pin.code,
          status: pin.status,
          termId: pin.termId,
          createdAt: pin.createdAt,
        });
      }
    }

    return {
      organizationId,
      term: {
        id: term.id,
        name: term.name,
        sessionName: term.session.name,
      },
      quantity: created.length,
      cards: created,
      warning:
        "Full PIN codes are returned once for printing. School admins never see them in the dashboard.",
    };
  }

  async listPinsForSchool(
    actor: Actor,
    organizationId: string,
    query: {
      termId: string;
      page: number;
      pageSize: number;
      status?: PinStatus;
      includeCodes: boolean;
      isPrinted: any;
    }
  ) {
    await this.assertCanAccessOrg(actor, organizationId);

    const isPrinted = query.isPrinted;

    const isPrintedFilter =
      isPrinted === undefined || isPrinted === null || isPrinted === ""
        ? undefined
        : isPrinted === true || isPrinted === "true" || isPrinted === "1";

    const pageSize = Math.min(query.pageSize, 100);
    const where: Prisma.PinWhereInput = {
      organizationId,
      termId: query.termId,
      ...(isPrintedFilter !== undefined ? { printed: isPrintedFilter } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.pin.count({ where }),
      prisma.pin.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * pageSize,
        take: Number(pageSize),
        select: {
          id: true,
          code: true,
          status: true,
          usedAt: true,
          expiresAt: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
        },
      }),
    ]);

    return {
      items: rows.map((p) => ({
        id: p.id,
        serial: p.id,
        code: query.includeCodes ? p.code : undefined,
        codeMasked: maskPinCode(p.code),
        status: p.status,
        usedAt: p.usedAt,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        student: p.student,
      })),
      meta: {
        page: query.page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    };
  }

  async markPrinted(organizationId: string, body: MarkPinsPrintedBody) {
    const { pinIds } = body;
    const uniqueIds = [...new Set(pinIds)];

    // Ensure all requested pins exist on this org (optional strictness)
    const found = await prisma.pin.findMany({
      where: {
        organizationId,
        id: { in: uniqueIds },
      },
      select: { id: true, printed: true },
    });

    if (found.length === 0) {
      throw new AppError(404, "No matching pins found for this school");
    }

    const foundIds = found.map((p) => p.id);
    const missing = uniqueIds.filter((id) => !foundIds.includes(id));

    const result = await prisma.pin.updateMany({
      where: {
        organizationId,
        id: { in: foundIds },
        printed: false,
      },
      data: {
        printed: true,
        printedAt: new Date(),
      },
    });

    return {
      requested: uniqueIds.length,
      matched: foundIds.length,
      updated: result.count,
      alreadyPrinted: found.filter((p) => p.printed).length,
      missingIds: missing,
    };
  }

  async getPinStatsForSchool(
    actor: Actor,
    organizationId: string,
    termId?: string
  ) {
    await this.assertCanAccessOrg(actor, organizationId);

    const where: Prisma.PinWhereInput = {
      organizationId,
      ...(termId ? { termId } : {}),
    };

    const grouped = await prisma.pin.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });

    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all])
    ) as Partial<Record<PinStatus, number>>;

    return {
      organizationId,
      termId: termId ?? null,
      total: Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0),
      unused: byStatus[PinStatus.UNUSED] ?? 0,
      used: byStatus[PinStatus.USED] ?? 0,
      disabled: byStatus[PinStatus.DISABLED] ?? 0,
      expired: byStatus[PinStatus.EXPIRED] ?? 0,
    };
  }

  /** Publish state lives on Result, not Term */
  async getTermPublishState(
    actor: Actor,
    organizationId: string,
    termId: string
  ) {
    await this.assertCanAccessOrg(actor, organizationId);

    const term = await prisma.term.findFirst({
      where: { id: termId, session: { organizationId } },
      select: {
        id: true,
        name: true,
        isCurrent: true,
        session: { select: { id: true, name: true } },
      },
    });
    if (!term) throw new NotFoundError("Term not found");

    // One groupBy instead of two full-table counts
    const groups = await prisma.result.groupBy({
      by: ["isPublished"],
      where: { termId, organizationId },
      _count: { _all: true },
    });

    let published = 0;
    let draft = 0;
    for (const g of groups) {
      if (g.isPublished) published = g._count._all;
      else draft = g._count._all;
    }

    return {
      term,
      results: { published, draft, total: published + draft },
    };
  }

  // ─── Platform admins (SUPER) ─────────────────────────────────────────────

  async createPlatformAdmin(actor: Actor, body: CreatePlatformAdminBody) {
    assertSuperAdmin(actor);

    const email = body.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.globalRole === GlobalRole.PLATFORM_ADMIN) {
        throw new BadRequestError("User is already a platform admin");
      }
      if (existing.globalRole === GlobalRole.SUPER_ADMIN) {
        throw new BadRequestError("Cannot demote super admin");
      }
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          globalRole: GlobalRole.PLATFORM_ADMIN,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone ?? existing.phone,
          ...(body.temporaryPassword
            ? { passwordHash: await bcrypt.hash(body.temporaryPassword, 12) }
            : {}),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          globalRole: true,
          isActive: true,
          createdAt: true,
        },
      });
    }

    return prisma.user.create({
      data: {
        email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        passwordHash: body.temporaryPassword
          ? await bcrypt.hash(body.temporaryPassword, 12)
          : null,
        globalRole: GlobalRole.PLATFORM_ADMIN,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        globalRole: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async listPlatformAdmins(
    actor: Actor,
    query: { page: number; pageSize: number; search?: string }
  ) {
    assertSuperAdmin(actor);

    const where: Prisma.UserWhereInput = {
      globalRole: GlobalRole.PLATFORM_ADMIN,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: Number(query.pageSize),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          createdAt: true,
          platformAdminAssignments: {
            select: {
              organization: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        isActive: u.isActive,
        createdAt: u.createdAt,
        schools: u.platformAdminAssignments.map((a) => a.organization),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize) || 0,
      },
    };
  }

  async assignSchools(actor: Actor, body: AssignSchoolsBody) {
    assertSuperAdmin(actor);

    const user = await prisma.user.findFirst({
      where: { id: body.userId, globalRole: GlobalRole.PLATFORM_ADMIN },
      select: { id: true },
    });
    if (!user) throw new NotFoundError("Platform admin not found");

    const orgs = await prisma.organization.findMany({
      where: { id: { in: body.organizationIds } },
      select: { id: true },
    });
    if (orgs.length !== body.organizationIds.length) {
      throw new BadRequestError("One or more schools not found");
    }

    await prisma.$transaction(
      body.organizationIds.map((organizationId) =>
        prisma.platformAdminAssignment.upsert({
          where: {
            userId_organizationId: {
              userId: body.userId,
              organizationId,
            },
          },
          create: {
            userId: body.userId,
            organizationId,
            assignedById: actor.userId,
            note: body.note ?? null,
          },
          update: {
            note: body.note ?? undefined,
            assignedById: actor.userId,
          },
        })
      )
    );

    const assignments = await prisma.platformAdminAssignment.findMany({
      where: { userId: body.userId },
      select: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return {
      userId: body.userId,
      schools: assignments.map((a) => a.organization),
    };
  }

  async unassignSchool(actor: Actor, userId: string, organizationId: string) {
    assertSuperAdmin(actor);
    await prisma.platformAdminAssignment.deleteMany({
      where: { userId, organizationId },
    });
    return { ok: true };
  }

  async setPlatformAdminActive(
    actor: Actor,
    userId: string,
    isActive: boolean
  ) {
    assertSuperAdmin(actor);

    const user = await prisma.user.findFirst({
      where: { id: userId, globalRole: GlobalRole.PLATFORM_ADMIN },
      select: { id: true },
    });
    if (!user) throw new NotFoundError("Platform admin not found");

    return prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        isActive: true,
        globalRole: true,
      },
    });
  }

  /**
   * Overview without loading thousands of org ids.
   * PLATFORM_ADMIN: filter by assignment list (small).
   * SUPER_ADMIN: global aggregates (index-friendly counts).
   */
  async getMyOverview(actor: Actor) {
    assertPlatformStaff(actor);

    if (actor.globalRole === GlobalRole.SUPER_ADMIN) {
      const [schoolsAssigned, activeStudents, unusedPins, usedPins] =
        await Promise.all([
          prisma.organization.count({ where: { isActive: true } }),
          prisma.student.count({ where: { isActive: true } }),
          prisma.pin.count({ where: { status: PinStatus.UNUSED } }),
          prisma.pin.count({ where: { status: PinStatus.USED } }),
        ]);

      return {
        role: actor.globalRole,
        schoolsAssigned,
        activeStudents,
        pinsUnused: unusedPins,
        pinsUsed: usedPins,
      };
    }

    const orgIds = (await this.accessibleOrgIds(actor)) as string[];
    if (orgIds.length === 0) {
      return {
        role: actor.globalRole,
        schoolsAssigned: 0,
        activeStudents: 0,
        pinsUnused: 0,
        pinsUsed: 0,
      };
    }

    const [schoolsAssigned, activeStudents, unusedPins, usedPins] =
      await Promise.all([
        prisma.organization.count({
          where: { id: { in: orgIds }, isActive: true },
        }),
        prisma.student.count({
          where: { organizationId: { in: orgIds }, isActive: true },
        }),
        prisma.pin.count({
          where: {
            organizationId: { in: orgIds },
            status: PinStatus.UNUSED,
          },
        }),
        prisma.pin.count({
          where: {
            organizationId: { in: orgIds },
            status: PinStatus.USED,
          },
        }),
      ]);

    return {
      role: actor.globalRole,
      schoolsAssigned,
      activeStudents,
      pinsUnused: unusedPins,
      pinsUsed: usedPins,
    };
  }
}

export const platformAdminService = new PlatformAdminService();
