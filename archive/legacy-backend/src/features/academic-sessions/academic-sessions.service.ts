import { OrgRole, Prisma, TermName } from "@prisma/client";
import { prisma } from "../../lib/prisma"; // adjust
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";

import type {
  CreateSessionBody,
  ListSessionsQuery,
  UpdateSessionBody,
  UpdateTermBody,
} from "./academic-sessions.dto";

type Actor = {
  userId: string;
  orgRole?: OrgRole | string | null;
  globalRole?: string;
  schoolId: string;
};

const sessionInclude = {
  terms: {
    orderBy: { name: "asc" as const },
  },
} satisfies Prisma.AcademicSessionInclude;

function assertAdmin(actor: Actor) {
  const ok =
    actor.orgRole === OrgRole.SCHOOL_ADMIN ||
    actor.orgRole === OrgRole.EXAM_OFFICER ||
    actor.globalRole === "SUPER_ADMIN";
  if (!ok) {
    throw new ForbiddenError(
      "Only school admin or exam officer can manage sessions"
    );
  }
}

const DEFAULT_TERMS: TermName[] = [
  TermName.FIRST,
  TermName.SECOND,
  TermName.THIRD,
];

export class AcademicSessionsService {
  async list(organizationId: string, query: ListSessionsQuery) {
    const { page = 1, limit } = query;
    const skip = (page - 1) * Number(limit);

    const where: Prisma.AcademicSessionWhereInput = { organizationId };

    const [items, total] = await Promise.all([
      prisma.academicSession.findMany({
        where,
        include: sessionInclude,
        orderBy: [{ isCurrent: "desc" }, { name: "desc" }],
        skip: Number(skip),
        take: Number(limit),
      }),
      prisma.academicSession.count({ where }),
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
  async getCurrent(organizationId: string) {
    const session = await prisma.academicSession.findFirst({
      where: { organizationId, isCurrent: true },
      include: sessionInclude,
    });

    if (!session) {
      // Fallback: latest session by name
      const fallback = await prisma.academicSession.findFirst({
        where: { organizationId },
        include: sessionInclude,
        orderBy: { name: "desc" },
      });
      if (!fallback) return null;

      const currentTerm =
        fallback.terms.find((t) => t.isCurrent) ?? fallback.terms[0] ?? null;

      return { session: fallback, currentTerm };
    }

    const currentTerm =
      session.terms.find((t) => t.isCurrent) ?? session.terms[0] ?? null;

    return { session, currentTerm };
  }

  async getById(organizationId: string, id: string) {
    const session = await prisma.academicSession.findFirst({
      where: { id, organizationId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundError("Academic session not found");
    return session;
  }

  async create(organizationId: string, body: CreateSessionBody, actor: Actor) {
    assertAdmin(actor);

    const existing = await prisma.academicSession.findUnique({
      where: {
        organizationId_name: { organizationId, name: body.name },
      },
    });
    if (existing) {
      throw new BadRequestError(`Session ${body.name} already exists`);
    }

    return prisma.$transaction(async (tx) => {
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

  async update(
    organizationId: string,
    id: string,
    body: UpdateSessionBody,
    actor: Actor
  ) {
    assertAdmin(actor);
    await this.getById(organizationId, id);

    if (body.name) {
      const clash = await prisma.academicSession.findFirst({
        where: {
          organizationId,
          name: body.name,
          NOT: { id },
        },
      });
      if (clash) {
        throw new BadRequestError(`Session ${body.name} already exists`);
      }
    }

    return prisma.$transaction(async (tx) => {
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

  async remove(organizationId: string, id: string, actor: Actor) {
    assertAdmin(actor);
    const session = await this.getById(organizationId, id);

    const resultCount = await prisma.result.count({
      where: {
        organizationId,
        term: { sessionId: id },
      },
    });
    if (resultCount > 0) {
      throw new BadRequestError(
        "Cannot delete a session that already has results. Archive by creating a new current session instead."
      );
    }

    await prisma.academicSession.delete({ where: { id: session.id } });
    return { id };
  }

  async updateTerm(
    organizationId: string,
    termId: string,
    body: UpdateTermBody,
    actor: Actor
  ) {
    assertAdmin(actor);

    const term = await prisma.term.findFirst({
      where: {
        id: termId,
        session: { organizationId },
      },
      include: { session: true },
    });
    if (!term) throw new NotFoundError("Term not found");

    return prisma.$transaction(async (tx) => {
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

  async getTerm(organizationId: string, termId: string) {
    const term = await prisma.term.findFirst({
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
    if (!term) throw new NotFoundError("Term not found");
    return term;
  }
}

export const academicSessionsService = new AcademicSessionsService();
