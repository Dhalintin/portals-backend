import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { schoolTransaction } from "../../lib/schoolTransaction";
import type { z } from "zod";
import type {
  createSessionSchema,
  createTermSchema,
  updateSessionSchema,
  updateTermSchema,
} from "./academic.validation";

type CreateSession = z.infer<typeof createSessionSchema>;
type UpdateSession = z.infer<typeof updateSessionSchema>;
type CreateTerm = z.infer<typeof createTermSchema>;
type UpdateTerm = z.infer<typeof updateTermSchema>;

export class AcademicService {
  async listSessions(organizationId: string) {
    return prisma.academicSession.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        terms: { orderBy: { name: "asc" } },
      },
    });
  }

  async createSession(organizationId: string, input: CreateSession) {
    return schoolTransaction(organizationId, async (tx) => {
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
      } catch {
        throw new AppError(
          409,
          "SESSION_EXISTS",
          "A session with this name already exists"
        );
      }
    });
  }

  async updateSession(
    organizationId: string,
    sessionId: string,
    input: UpdateSession
  ) {
    const session = await prisma.academicSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }

    return schoolTransaction(organizationId, async (tx) => {
      const current = await tx.academicSession.findFirst({ where: { id: sessionId, organizationId } });
      if (!current) throw new AppError(404, "NOT_FOUND", "Session not found");
      if (input.isCurrent === true) {
        await this.clearCurrentTermsInOrg(tx, organizationId, sessionId);
        await tx.academicSession.updateMany({
          where: { organizationId, isCurrent: true },
          data: { isCurrent: false },
        });
      } else if (input.isCurrent === false && current.isCurrent) {
        await this.clearCurrentTermsInOrg(tx, organizationId);
      }

      try {
        return await tx.academicSession.update({
          where: { id: sessionId },
          data: {
            name: input.name,
            startDate:
              input.startDate === undefined ? undefined : input.startDate,
            endDate: input.endDate === undefined ? undefined : input.endDate,
            isCurrent: input.isCurrent,
          },
          include: { terms: { orderBy: { name: "asc" } } },
        });
      } catch {
        throw new AppError(
          409,
          "SESSION_EXISTS",
          "A session with this name already exists"
        );
      }
    });
  }

  async setCurrentSession(organizationId: string, sessionId: string) {
    const session = await prisma.academicSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }

    return schoolTransaction(organizationId, async (tx) => {
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

  async createTerm(
    organizationId: string,
    sessionId: string,
    input: CreateTerm
  ) {
    const session = await prisma.academicSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Session not found");
    }

    return schoolTransaction(organizationId, async (tx) => {
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
      } catch {
        throw new AppError(
          409,
          "TERM_EXISTS",
          "This term already exists in the session"
        );
      }
    });
  }

  async updateTerm(
    organizationId: string,
    sessionId: string,
    termId: string,
    input: UpdateTerm
  ) {
    const term = await prisma.term.findFirst({
      where: {
        id: termId,
        sessionId,
        session: { organizationId },
      },
    });
    if (!term) {
      throw new AppError(404, "NOT_FOUND", "Term not found");
    }

    return schoolTransaction(organizationId, async (tx) => {
      if (input.isCurrent === true) {
        await this.clearCurrentTermsInOrg(tx, organizationId);
        await tx.academicSession.updateMany({ where: { organizationId, isCurrent: true }, data: { isCurrent: false } });
        await tx.academicSession.update({ where: { id: sessionId }, data: { isCurrent: true } });
      }

      return tx.term.update({
        where: { id: termId },
        data: {
          startDate:
            input.startDate === undefined ? undefined : input.startDate,
          endDate: input.endDate === undefined ? undefined : input.endDate,
          isCurrent: input.isCurrent,
        },
      });
    });
  }

  async setCurrentTerm(
    organizationId: string,
    sessionId: string,
    termId: string
  ) {
    const term = await prisma.term.findFirst({
      where: {
        id: termId,
        sessionId,
        session: { organizationId },
      },
    });
    if (!term) {
      throw new AppError(404, "NOT_FOUND", "Term not found");
    }

    return schoolTransaction(organizationId, async (tx) => {
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

  async getCurrent(organizationId: string) {
    const session = await prisma.academicSession.findFirst({
      where: { organizationId, isCurrent: true },
      include: {
        terms: { orderBy: { name: "asc" } },
      },
    });
    const term = session?.terms.find((t) => t.isCurrent) ?? null;

    return { session, term: term ?? null };
  }

  private async clearCurrentTermsInOrg(
    tx: Prisma.TransactionClient,
    organizationId: string,
    keepSessionId?: string
  ) {
    const sessions = await tx.academicSession.findMany({
      where: { organizationId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    if (ids.length === 0) return;
    await tx.term.updateMany({
      where: { sessionId: { in: ids }, isCurrent: true },
      data: { isCurrent: false },
    });
  }
}

export const academicService = new AcademicService();
