"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.academicService = exports.AcademicService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
class AcademicService {
    async listSessions(organizationId) {
        return prisma_1.prisma.academicSession.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            include: {
                terms: { orderBy: { name: "asc" } },
            },
        });
    }
    async createSession(organizationId, input) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (input.isCurrent) {
                await this.clearCurrentTermsInOrg(tx, organizationId);
                await tx.academicSession.updateMany({
                    where: { organizationId, isCurrent: true },
                    data: { isCurrent: false },
                });
            }
            try {
                return await tx.academicSession.create({
                    data: {
                        organizationId,
                        name: input.name,
                        startDate: input.startDate ?? null,
                        endDate: input.endDate ?? null,
                        isCurrent: input.isCurrent ?? false,
                    },
                    include: { terms: true },
                });
            }
            catch {
                throw new errors_1.AppError(409, "SESSION_EXISTS", "A session with this name already exists");
            }
        });
    }
    async updateSession(organizationId, sessionId, input) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { id: sessionId, organizationId },
        });
        if (!session) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Session not found");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const current = await tx.academicSession.findFirst({ where: { id: sessionId, organizationId } });
            if (!current)
                throw new errors_1.AppError(404, "NOT_FOUND", "Session not found");
            if (input.isCurrent === true) {
                await this.clearCurrentTermsInOrg(tx, organizationId, sessionId);
                await tx.academicSession.updateMany({
                    where: { organizationId, isCurrent: true },
                    data: { isCurrent: false },
                });
            }
            else if (input.isCurrent === false && current.isCurrent) {
                await this.clearCurrentTermsInOrg(tx, organizationId);
            }
            try {
                return await tx.academicSession.update({
                    where: { id: sessionId },
                    data: {
                        name: input.name,
                        startDate: input.startDate === undefined ? undefined : input.startDate,
                        endDate: input.endDate === undefined ? undefined : input.endDate,
                        isCurrent: input.isCurrent,
                    },
                    include: { terms: { orderBy: { name: "asc" } } },
                });
            }
            catch {
                throw new errors_1.AppError(409, "SESSION_EXISTS", "A session with this name already exists");
            }
        });
    }
    async setCurrentSession(organizationId, sessionId) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { id: sessionId, organizationId },
        });
        if (!session) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Session not found");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            await this.clearCurrentTermsInOrg(tx, organizationId, sessionId);
            await tx.academicSession.updateMany({
                where: { organizationId, isCurrent: true },
                data: { isCurrent: false },
            });
            return tx.academicSession.update({
                where: { id: sessionId },
                data: { isCurrent: true },
                include: { terms: { orderBy: { name: "asc" } } },
            });
        });
    }
    async createTerm(organizationId, sessionId, input) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { id: sessionId, organizationId },
        });
        if (!session) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Session not found");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (input.isCurrent) {
                await this.clearCurrentTermsInOrg(tx, organizationId);
                await tx.academicSession.updateMany({ where: { organizationId, isCurrent: true }, data: { isCurrent: false } });
                await tx.academicSession.update({ where: { id: sessionId }, data: { isCurrent: true } });
            }
            try {
                return await tx.term.create({
                    data: {
                        sessionId,
                        name: input.name,
                        startDate: input.startDate ?? null,
                        endDate: input.endDate ?? null,
                        isCurrent: input.isCurrent ?? false,
                    },
                });
            }
            catch {
                throw new errors_1.AppError(409, "TERM_EXISTS", "This term already exists in the session");
            }
        });
    }
    async updateTerm(organizationId, sessionId, termId, input) {
        const term = await prisma_1.prisma.term.findFirst({
            where: {
                id: termId,
                sessionId,
                session: { organizationId },
            },
        });
        if (!term) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Term not found");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (input.isCurrent === true) {
                await this.clearCurrentTermsInOrg(tx, organizationId);
                await tx.academicSession.updateMany({ where: { organizationId, isCurrent: true }, data: { isCurrent: false } });
                await tx.academicSession.update({ where: { id: sessionId }, data: { isCurrent: true } });
            }
            return tx.term.update({
                where: { id: termId },
                data: {
                    startDate: input.startDate === undefined ? undefined : input.startDate,
                    endDate: input.endDate === undefined ? undefined : input.endDate,
                    isCurrent: input.isCurrent,
                },
            });
        });
    }
    async setCurrentTerm(organizationId, sessionId, termId) {
        const term = await prisma_1.prisma.term.findFirst({
            where: {
                id: termId,
                sessionId,
                session: { organizationId },
            },
        });
        if (!term) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Term not found");
        }
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            await this.clearCurrentTermsInOrg(tx, organizationId);
            // Ensure parent session is current when term is current
            await tx.academicSession.updateMany({
                where: { organizationId, isCurrent: true },
                data: { isCurrent: false },
            });
            await tx.academicSession.update({
                where: { id: sessionId },
                data: { isCurrent: true },
            });
            return tx.term.update({
                where: { id: termId },
                data: { isCurrent: true },
            });
        });
    }
    async getCurrent(organizationId) {
        const session = await prisma_1.prisma.academicSession.findFirst({
            where: { organizationId, isCurrent: true },
            include: {
                terms: { orderBy: { name: "asc" } },
            },
        });
        const term = session?.terms.find((t) => t.isCurrent) ?? null;
        return { session, term: term ?? null };
    }
    async clearCurrentTermsInOrg(tx, organizationId, keepSessionId) {
        const sessions = await tx.academicSession.findMany({
            where: { organizationId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
            select: { id: true },
        });
        const ids = sessions.map((s) => s.id);
        if (ids.length === 0)
            return;
        await tx.term.updateMany({
            where: { sessionId: { in: ids }, isCurrent: true },
            data: { isCurrent: false },
        });
    }
}
exports.AcademicService = AcademicService;
exports.academicService = new AcademicService();
