"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformAdminService = exports.PlatformAdminService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
const pins_codes_1 = require("../pins/pins.codes");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function assertPlatformStaff(actor) {
    if (actor.globalRole !== client_1.GlobalRole.SUPER_ADMIN &&
        actor.globalRole !== client_1.GlobalRole.PLATFORM_ADMIN) {
        throw new AppError_1.ForbiddenError("Platform staff only");
    }
}
function assertSuperAdmin(actor) {
    if (actor.globalRole !== client_1.GlobalRole.SUPER_ADMIN) {
        throw new AppError_1.ForbiddenError("Super admin only");
    }
}
/** Bound IN-lists for platform admins (assignments stay small) */
const MAX_ASSIGNED_ORGS = 500;
class PlatformAdminService {
    async accessibleOrgIds(actor) {
        if (actor.globalRole === client_1.GlobalRole.SUPER_ADMIN)
            return "all";
        const rows = await prisma_1.prisma.platformAdminAssignment.findMany({
            where: { userId: actor.userId },
            select: { organizationId: true },
            take: Number(MAX_ASSIGNED_ORGS),
        });
        return rows.map((r) => r.organizationId);
    }
    async assertCanAccessOrg(actor, organizationId) {
        assertPlatformStaff(actor);
        if (actor.globalRole === client_1.GlobalRole.SUPER_ADMIN)
            return;
        const hit = await prisma_1.prisma.platformAdminAssignment.findUnique({
            where: {
                userId_organizationId: {
                    userId: actor.userId,
                    organizationId,
                },
            },
            select: { id: true },
        });
        if (!hit)
            throw new AppError_1.ForbiddenError("School is not assigned to you");
    }
    // ─── Schools ─────────────────────────────────────────────────────────────
    /**
     * Scalable list: 1 count + 1 page query + a few groupBy over *only those org ids*
     * (not N+1 per school).
     */
    async listSchools(actor, query) {
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
        const where = {
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
            prisma_1.prisma.organization.count({ where }),
            prisma_1.prisma.organization.findMany({
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
            prisma_1.prisma.student.groupBy({
                by: ["organizationId"],
                where: { organizationId: { in: orgIds }, isActive: true },
                _count: { _all: true },
            }),
            prisma_1.prisma.pin.groupBy({
                by: ["organizationId", "status"],
                where: {
                    organizationId: { in: orgIds },
                    status: { in: [client_1.PinStatus.UNUSED, client_1.PinStatus.USED] },
                },
                _count: { _all: true },
            }),
            // Current term per org via sessions marked current
            prisma_1.prisma.term.findMany({
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
        const publishByTerm = termIds.length === 0
            ? []
            : await prisma_1.prisma.result.groupBy({
                by: ["termId", "isPublished"],
                where: { termId: { in: termIds } },
                _count: { _all: true },
            });
        const studentsByOrg = new Map(studentGroups.map((g) => [g.organizationId, g._count._all]));
        const pinsUnusedByOrg = new Map();
        const pinsUsedByOrg = new Map();
        for (const g of pinGroups) {
            if (g.status === client_1.PinStatus.UNUSED) {
                pinsUnusedByOrg.set(g.organizationId, g._count._all);
            }
            else if (g.status === client_1.PinStatus.USED) {
                pinsUsedByOrg.set(g.organizationId, g._count._all);
            }
        }
        const termByOrg = new Map(currentTerms.map((t) => [
            t.session.organizationId,
            { id: t.id, name: t.name, sessionName: t.session.name },
        ]));
        const publishedByTermId = new Map();
        const draftByTermId = new Map();
        for (const g of publishByTerm) {
            if (g.isPublished)
                publishedByTermId.set(g.termId, g._count._all);
            else
                draftByTermId.set(g.termId, g._count._all);
        }
        const items = rows.map((org) => {
            const term = termByOrg.get(org.id) ?? null;
            const published = term ? publishedByTermId.get(term.id) ?? 0 : 0;
            const draft = term ? draftByTermId.get(term.id) ?? 0 : 0;
            // "Term published" ≈ any results published (or all non-draft if you prefer)
            const isPublished = published > 0 && draft === 0 && published + draft > 0
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
    async getSchoolDetail(actor, organizationId) {
        await this.assertCanAccessOrg(actor, organizationId);
        const [org, activeStudents, classes, subjects, sessions, pinStats] = await Promise.all([
            prisma_1.prisma.organization.findFirst({
                where: { id: organizationId },
                include: {
                    site: true,
                    memberships: {
                        where: { role: client_1.OrgRole.SCHOOL_ADMIN, isActive: true },
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
            prisma_1.prisma.student.count({
                where: { organizationId, isActive: true },
            }),
            prisma_1.prisma.class.count({
                where: { organizationId, isActive: true },
            }),
            prisma_1.prisma.subject.count({
                where: { organizationId, isActive: true },
            }),
            prisma_1.prisma.academicSession.findMany({
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
            prisma_1.prisma.pin.groupBy({
                by: ["status"],
                where: { organizationId },
                _count: { _all: true },
            }),
        ]);
        if (!org)
            throw new AppError_1.NotFoundError("School not found");
        const pinsByStatus = Object.fromEntries(pinStats.map((p) => [p.status, p._count._all]));
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
                    unused: pinsByStatus[client_1.PinStatus.UNUSED] ?? 0,
                    used: pinsByStatus[client_1.PinStatus.USED] ?? 0,
                    disabled: pinsByStatus[client_1.PinStatus.DISABLED] ?? 0,
                    expired: pinsByStatus[client_1.PinStatus.EXPIRED] ?? 0,
                    total: Object.values(pinsByStatus).reduce((a, b) => a + b, 0),
                },
            },
            recentSessions: sessions,
        };
    }
    async setSchoolActive(actor, organizationId, isActive) {
        assertSuperAdmin(actor);
        return prisma_1.prisma.organization.update({
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
    async generatePinsForSchool(actor, organizationId, body) {
        await this.assertCanAccessOrg(actor, organizationId);
        const term = await prisma_1.prisma.term.findFirst({
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
        if (!term)
            throw new AppError_1.NotFoundError("Term not found for this school");
        const quantity = body.quantity;
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        // Generate more codes than needed to absorb rare collisions
        const codeSet = new Set();
        let guard = 0;
        while (codeSet.size < quantity && guard < quantity * 5) {
            codeSet.add((0, pins_codes_1.generatePinCode)());
            guard++;
        }
        if (codeSet.size < quantity) {
            throw new AppError_1.BadRequestError("Could not generate enough unique PIN codes");
        }
        const codes = [...codeSet].slice(0, quantity);
        const CHUNK = 100;
        const created = [];
        for (let i = 0; i < codes.length; i += CHUNK) {
            const slice = codes.slice(i, i + CHUNK);
            // Short transaction per chunk
            const batch = await prisma_1.prisma.$transaction(async (tx) => {
                const rows = await Promise.all(slice.map((code) => tx.pin.create({
                    data: {
                        code,
                        organizationId,
                        termId: body.termId,
                        status: client_1.PinStatus.UNUSED,
                        expiresAt,
                    },
                    select: {
                        id: true,
                        code: true,
                        status: true,
                        termId: true,
                        createdAt: true,
                    },
                })));
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
            warning: "Full PIN codes are returned once for printing. School admins never see them in the dashboard.",
        };
    }
    async listPinsForSchool(actor, organizationId, query) {
        await this.assertCanAccessOrg(actor, organizationId);
        const pageSize = Math.min(query.pageSize, 100);
        const where = {
            organizationId,
            termId: query.termId,
            ...(query.status ? { status: query.status } : {}),
        };
        const [total, rows] = await Promise.all([
            prisma_1.prisma.pin.count({ where }),
            prisma_1.prisma.pin.findMany({
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
                codeMasked: (0, pins_codes_1.maskPinCode)(p.code),
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
    async getPinStatsForSchool(actor, organizationId, termId) {
        await this.assertCanAccessOrg(actor, organizationId);
        const where = {
            organizationId,
            ...(termId ? { termId } : {}),
        };
        const grouped = await prisma_1.prisma.pin.groupBy({
            by: ["status"],
            where,
            _count: { _all: true },
        });
        const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
        return {
            organizationId,
            termId: termId ?? null,
            total: Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0),
            unused: byStatus[client_1.PinStatus.UNUSED] ?? 0,
            used: byStatus[client_1.PinStatus.USED] ?? 0,
            disabled: byStatus[client_1.PinStatus.DISABLED] ?? 0,
            expired: byStatus[client_1.PinStatus.EXPIRED] ?? 0,
        };
    }
    /** Publish state lives on Result, not Term */
    async getTermPublishState(actor, organizationId, termId) {
        await this.assertCanAccessOrg(actor, organizationId);
        const term = await prisma_1.prisma.term.findFirst({
            where: { id: termId, session: { organizationId } },
            select: {
                id: true,
                name: true,
                isCurrent: true,
                session: { select: { id: true, name: true } },
            },
        });
        if (!term)
            throw new AppError_1.NotFoundError("Term not found");
        // One groupBy instead of two full-table counts
        const groups = await prisma_1.prisma.result.groupBy({
            by: ["isPublished"],
            where: { termId, organizationId },
            _count: { _all: true },
        });
        let published = 0;
        let draft = 0;
        for (const g of groups) {
            if (g.isPublished)
                published = g._count._all;
            else
                draft = g._count._all;
        }
        return {
            term,
            results: { published, draft, total: published + draft },
        };
    }
    // ─── Platform admins (SUPER) ─────────────────────────────────────────────
    async createPlatformAdmin(actor, body) {
        assertSuperAdmin(actor);
        const email = body.email.toLowerCase().trim();
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            if (existing.globalRole === client_1.GlobalRole.PLATFORM_ADMIN) {
                throw new AppError_1.BadRequestError("User is already a platform admin");
            }
            if (existing.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
                throw new AppError_1.BadRequestError("Cannot demote super admin");
            }
            return prisma_1.prisma.user.update({
                where: { id: existing.id },
                data: {
                    globalRole: client_1.GlobalRole.PLATFORM_ADMIN,
                    firstName: body.firstName,
                    lastName: body.lastName,
                    phone: body.phone ?? existing.phone,
                    ...(body.temporaryPassword
                        ? { passwordHash: await bcryptjs_1.default.hash(body.temporaryPassword, 12) }
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
        return prisma_1.prisma.user.create({
            data: {
                email,
                firstName: body.firstName,
                lastName: body.lastName,
                phone: body.phone ?? null,
                passwordHash: body.temporaryPassword
                    ? await bcryptjs_1.default.hash(body.temporaryPassword, 12)
                    : null,
                globalRole: client_1.GlobalRole.PLATFORM_ADMIN,
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
    async listPlatformAdmins(actor, query) {
        assertSuperAdmin(actor);
        const where = {
            globalRole: client_1.GlobalRole.PLATFORM_ADMIN,
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
            prisma_1.prisma.user.count({ where }),
            prisma_1.prisma.user.findMany({
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
    async assignSchools(actor, body) {
        assertSuperAdmin(actor);
        const user = await prisma_1.prisma.user.findFirst({
            where: { id: body.userId, globalRole: client_1.GlobalRole.PLATFORM_ADMIN },
            select: { id: true },
        });
        if (!user)
            throw new AppError_1.NotFoundError("Platform admin not found");
        const orgs = await prisma_1.prisma.organization.findMany({
            where: { id: { in: body.organizationIds } },
            select: { id: true },
        });
        if (orgs.length !== body.organizationIds.length) {
            throw new AppError_1.BadRequestError("One or more schools not found");
        }
        await prisma_1.prisma.$transaction(body.organizationIds.map((organizationId) => prisma_1.prisma.platformAdminAssignment.upsert({
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
        })));
        const assignments = await prisma_1.prisma.platformAdminAssignment.findMany({
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
    async unassignSchool(actor, userId, organizationId) {
        assertSuperAdmin(actor);
        await prisma_1.prisma.platformAdminAssignment.deleteMany({
            where: { userId, organizationId },
        });
        return { ok: true };
    }
    async setPlatformAdminActive(actor, userId, isActive) {
        assertSuperAdmin(actor);
        const user = await prisma_1.prisma.user.findFirst({
            where: { id: userId, globalRole: client_1.GlobalRole.PLATFORM_ADMIN },
            select: { id: true },
        });
        if (!user)
            throw new AppError_1.NotFoundError("Platform admin not found");
        return prisma_1.prisma.user.update({
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
    async getMyOverview(actor) {
        assertPlatformStaff(actor);
        if (actor.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
            const [schoolsAssigned, activeStudents, unusedPins, usedPins] = await Promise.all([
                prisma_1.prisma.organization.count({ where: { isActive: true } }),
                prisma_1.prisma.student.count({ where: { isActive: true } }),
                prisma_1.prisma.pin.count({ where: { status: client_1.PinStatus.UNUSED } }),
                prisma_1.prisma.pin.count({ where: { status: client_1.PinStatus.USED } }),
            ]);
            return {
                role: actor.globalRole,
                schoolsAssigned,
                activeStudents,
                pinsUnused: unusedPins,
                pinsUsed: usedPins,
            };
        }
        const orgIds = (await this.accessibleOrgIds(actor));
        if (orgIds.length === 0) {
            return {
                role: actor.globalRole,
                schoolsAssigned: 0,
                activeStudents: 0,
                pinsUnused: 0,
                pinsUsed: 0,
            };
        }
        const [schoolsAssigned, activeStudents, unusedPins, usedPins] = await Promise.all([
            prisma_1.prisma.organization.count({
                where: { id: { in: orgIds }, isActive: true },
            }),
            prisma_1.prisma.student.count({
                where: { organizationId: { in: orgIds }, isActive: true },
            }),
            prisma_1.prisma.pin.count({
                where: {
                    organizationId: { in: orgIds },
                    status: client_1.PinStatus.UNUSED,
                },
            }),
            prisma_1.prisma.pin.count({
                where: {
                    organizationId: { in: orgIds },
                    status: client_1.PinStatus.USED,
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
exports.PlatformAdminService = PlatformAdminService;
exports.platformAdminService = new PlatformAdminService();
