import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { invitationsService } from "../auth/invitations.service";
import { auditService } from "../audit/audit.service";
import type { z } from "zod";
import type {
  createParentSchema,
  inviteParentUserSchema,
  linkStudentSchema,
  listParentsQuerySchema,
  updateParentSchema,
} from "./parents.validation";

type ListQuery = z.infer<typeof listParentsQuerySchema>;
type CreateInput = z.infer<typeof createParentSchema>;
type UpdateInput = z.infer<typeof updateParentSchema>;

export class ParentsService {
  async me(organizationId: string, userId: string) {
    const parent = await prisma.parent.findFirst({
      where: { organizationId, userId, isActive: true },
      select: {
        id: true, firstName: true, lastName: true, phone: true, email: true,
        children: {
          where: { organizationId, student: { organizationId, isActive: true } },
          select: {
            relation: true, isPrimary: true,
            student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true, classId: true } },
          },
          orderBy: { studentId: "asc" },
        },
      },
    });
    if (!parent) throw new AppError(403, "NOT_A_PARENT", "No active parent profile linked in this school");
    return parent;
  }

  async list(organizationId: string, query: ListQuery) {
    const where: Prisma.ParentWhereInput = {
      organizationId,
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" } },
              { lastName: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.parent.findMany({
        where,
        include: {
          _count: { select: { children: true } },
          user: { select: { id: true, email: true, isActive: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: query.limit,
      }),
      prisma.parent.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        isActive: p.isActive,
        childCount: p._count.children,
        user: p.user,
        createdAt: p.createdAt,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async get(organizationId: string, parentId: string) {
    const parent = await prisma.parent.findFirst({
      where: { id: parentId, organizationId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        children: {
          where: { organizationId, student: { organizationId } },
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
                classId: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!parent) throw new AppError(404, "NOT_FOUND", "Parent not found");
    return parent;
  }

  async create(organizationId: string, input: CreateInput) {
    return prisma.parent.create({
      data: {
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
      },
    });
  }

  async update(organizationId: string, parentId: string, input: UpdateInput) {
    await this.requireParent(organizationId, parentId);

    return prisma.parent.update({
      where: { id: parentId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone === undefined ? undefined : input.phone,
        email: input.email === undefined ? undefined : input.email,
        isActive: input.isActive,
      },
    });
  }

  async linkStudent(
    organizationId: string,
    parentId: string,
    input: z.infer<typeof linkStudentSchema>
  ) {
    await this.requireParent(organizationId, parentId);

    const student = await prisma.student.findFirst({
      where: { id: input.studentId, organizationId },
      select: { id: true },
    });
    if (!student) {
      throw new AppError(404, "NOT_FOUND", "Student not found");
    }

    try {
      return await prisma.parentStudent.create({
        data: {
          organizationId,
          parentId,
          studentId: input.studentId,
          relation: input.relation ?? null,
          isPrimary: input.isPrimary ?? true,
        },
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } catch {
      throw new AppError(
        409,
        "ALREADY_LINKED",
        "This student is already linked to this parent"
      );
    }
  }

  async unlinkStudent(
    organizationId: string,
    parentId: string,
    studentId: string
  ) {
    const link = await prisma.parentStudent.findFirst({
      where: { organizationId, parentId, studentId },
    });
    if (!link) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }
    await prisma.parentStudent.delete({ where: { id: link.id } });
    return { ok: true };
  }

  /**
   * Queues an invitation; acceptance creates the membership and links the parent.
   */
  async inviteUser(
    organizationId: string,
    parentId: string,
    actorId: string,
    input: z.infer<typeof inviteParentUserSchema>,
    requestId?: string
  ) {
    const parent = await this.requireParent(organizationId, parentId);
    return invitationsService.create(organizationId, actorId, { email: input.email, firstName: parent.firstName,
      lastName: parent.lastName, ...(parent.phone ? { phone: parent.phone } : {}), role: "PARENT", parentId }, requestId);
  }
  private async requireParent(organizationId: string, parentId: string) {
    const row = await prisma.parent.findFirst({
      where: { id: parentId, organizationId },
    });
    if (!row) throw new AppError(404, "NOT_FOUND", "Parent not found");
    return row;
  }
}

export const parentsService = new ParentsService();
