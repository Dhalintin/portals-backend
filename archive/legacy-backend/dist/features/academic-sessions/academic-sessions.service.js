"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicSessionsService = exports.AcademicSessionsService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma"); // adjust
const AppError_1 = require("../../common/errors/AppError");
const sessionInclude = {
    terms: {
        orderBy: { name: "asc" },
    },
};
function assertAdmin(actor) {
    const ok = actor.orgRole === client_1.OrgRole.SCHOOL_ADMIN ||
        actor.orgRole === client_1.OrgRole.EXAM_OFFICER ||
        actor.globalRole === "SUPER_ADMIN";
    if (!ok) {
        throw new AppError_1.ForbiddenError("Only school admin or exam officer can manage sessions");
    }
}
const DEFAULT_TERMS = [
    client_1.TermName.FIRST,
    client_1.TermName.SECOND,
    client_1.TermName.THIRD,
];
class AcademicSessionsService {
    async list(organizationId, query) {
        const { page = 1, limit } = query;
        const skip = (page - 1) * Number(limit);
        const where = { organizationId };
        const [items, total] = await Promise.all([
            prisma_1.prisma.academicSession.findMany({
                where,
                include: sessionInclude,
                orderBy: [{ isCurrent: "desc" }, { name: "desc" }],
                skip: Number(skip),
                take: Number(limit),
            }),
            prisma_1.prisma.academicSession.count({ where }),
        ]);
        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
    /** Current session + current term (or first term) — for Results picker default */
    async getCurrent(organizationId) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { organizationId, isCurrent: true },
            include: sessionInclude,
        });
        if (!session) {
            // Fallback: latest session by name
            const fallback = await prisma_1.prisma.academicSession.findFirst({
                where: { organizationId },
                include: sessionInclude,
                orderBy: { name: "desc" },
            });
            if (!fallback)
                return null;
            const currentTerm = fallback.terms.find((t) => t.isCurrent) ?? fallback.terms[0] ?? null;
            return { session: fallback, currentTerm };
        }
        const currentTerm = session.terms.find((t) => t.isCurrent) ?? session.terms[0] ?? null;
        return { session, currentTerm };
    }
    async getById(organizationId, id) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { id, organizationId },
            include: sessionInclude,
        });
        if (!session)
            throw new AppError_1.NotFoundError("Academic session not found");
        return session;
    }
    async create(organizationId, body, actor) {
        assertAdmin(actor);
        const existing = await prisma_1.prisma.academicSession.findUnique({
            where: {
                organizationId_name: { organizationId, name: body.name },
            },
        });
        if (existing) {
            throw new AppError_1.BadRequestError(`Session ${body.name} already exists`);
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            if (body.isCurrent) {
                await tx.academicSession.updateMany({
                    where: { organizationId, isCurrent: true },
                    data: { isCurrent: false },
                });
            }
            const session = await tx.academicSession.create({
                data: {
                    organizationId,
                    name: body.name,
                    startDate: body.startDate ?? null,
                    endDate: body.endDate ?? null,
                    isCurrent: body.isCurrent ?? false,
                    ...(body.createDefaultTerms !== false
                        ? {
                            terms: {
                                create: DEFAULT_TERMS.map((name, index) => ({
                                    name,
                                    // First term current only if this is the current session
                                    isCurrent: Boolean(body.isCurrent) && index === 0,
                                })),
                            },
                        }
                        : {}),
                },
                include: sessionInclude,
            });
            return session;
        });
    }
    async update(organizationId, id, body, actor) {
        assertAdmin(actor);
        await this.getById(organizationId, id);
        if (body.name) {
            const clash = await prisma_1.prisma.academicSession.findFirst({
                where: {
                    organizationId,
                    name: body.name,
                    NOT: { id },
                },
            });
            if (clash) {
                throw new AppError_1.BadRequestError(`Session ${body.name} already exists`);
            }
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            if (body.isCurrent === true) {
                await tx.academicSession.updateMany({
                    where: { organizationId, isCurrent: true },
                    data: { isCurrent: false },
                });
            }
            return tx.academicSession.update({
                where: { id },
                data: {
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.startDate !== undefined
                        ? { startDate: body.startDate }
                        : {}),
                    ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
                    ...(body.isCurrent !== undefined
                        ? { isCurrent: body.isCurrent }
                        : {}),
                },
                include: sessionInclude,
            });
        });
    }
    async remove(organizationId, id, actor) {
        assertAdmin(actor);
        const session = await this.getById(organizationId, id);
        const resultCount = await prisma_1.prisma.result.count({
            where: {
                organizationId,
                term: { sessionId: id },
            },
        });
        if (resultCount > 0) {
            throw new AppError_1.BadRequestError("Cannot delete a session that already has results. Archive by creating a new current session instead.");
        }
        await prisma_1.prisma.academicSession.delete({ where: { id: session.id } });
        return { id };
    }
    async updateTerm(organizationId, termId, body, actor) {
        assertAdmin(actor);
        const term = await prisma_1.prisma.term.findFirst({
            where: {
                id: termId,
                session: { organizationId },
            },
            include: { session: true },
        });
        if (!term)
            throw new AppError_1.NotFoundError("Term not found");
        return prisma_1.prisma.$transaction(async (tx) => {
            if (body.isCurrent === true) {
                // Only one current term within this session
                await tx.term.updateMany({
                    where: { sessionId: term.sessionId, isCurrent: true },
                    data: { isCurrent: false },
                });
                // Optionally promote parent session to current
                await tx.academicSession.updateMany({
                    where: { organizationId, isCurrent: true },
                    data: { isCurrent: false },
                });
                await tx.academicSession.update({
                    where: { id: term.sessionId },
                    data: { isCurrent: true },
                });
            }
            return tx.term.update({
                where: { id: termId },
                data: {
                    ...(body.startDate !== undefined
                        ? { startDate: body.startDate }
                        : {}),
                    ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
                    ...(body.isCurrent !== undefined
                        ? { isCurrent: body.isCurrent }
                        : {}),
                },
                include: {
                    session: {
                        select: {
                            id: true,
                            name: true,
                            isCurrent: true,
                            organizationId: true,
                        },
                    },
                },
            });
        });
    }
    async getTerm(organizationId, termId) {
        const term = await prisma_1.prisma.term.findFirst({
            where: {
                id: termId,
                session: { organizationId },
            },
            include: {
                session: {
                    select: { id: true, name: true, isCurrent: true },
                },
            },
        });
        if (!term)
            throw new AppError_1.NotFoundError("Term not found");
        return term;
    }
}
exports.AcademicSessionsService = AcademicSessionsService;
exports.academicSessionsService = new AcademicSessionsService();
