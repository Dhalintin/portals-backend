import type { Prisma, Subject } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import type {
  CreateSubjectBody,
  ListSubjectsQuery,
  UpdateSubjectBody,
} from "./subject.dto";
import type { SubjectPublic } from "./subject.types";

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) throw new ForbiddenError("No school context");
  return schoolId;
}

function toSubjectPublic(row: Subject): SubjectPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export const subjectService = {
  async list(schoolId: string | null | undefined, query: ListSubjectsQuery) {
    const organizationId = requireSchoolId(schoolId);

    const where: Prisma.SubjectWhereInput = { organizationId };

    if (query.isActive === "true") where.isActive = true;
    if (query.isActive === "false") where.isActive = false;

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.subject.count({ where }),
      prisma.subject.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: Number(pageSize),
      }),
    ]);

    return {
      items: rows.map(toSubjectPublic),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  },

  async getById(schoolId: string | null | undefined, id: string) {
    const organizationId = requireSchoolId(schoolId);
    const row = await prisma.subject.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundError("Subject not found");
    return toSubjectPublic(row);
  },

  async create(schoolId: string | null | undefined, input: CreateSubjectBody) {
    const organizationId = requireSchoolId(schoolId);
    try {
      const row = await prisma.subject.create({
        data: {
          organizationId,
          name: input.name,
          code: input.code ?? null,
          isActive: true,
        },
      });
      return toSubjectPublic(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          "A subject with this name already exists in your school"
        );
      }
      throw err;
    }
  },

  async update(
    schoolId: string | null | undefined,
    id: string,
    input: UpdateSubjectBody
  ) {
    const organizationId = requireSchoolId(schoolId);
    const existing = await prisma.subject.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError("Subject not found");

    try {
      const row = await prisma.subject.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      return toSubjectPublic(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          "A subject with this name already exists in your school"
        );
      }
      throw err;
    }
  },

  async remove(schoolId: string | null | undefined, id: string) {
    const organizationId = requireSchoolId(schoolId);
    const existing = await prisma.subject.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError("Subject not found");

    const row = await prisma.subject.update({
      where: { id },
      data: { isActive: false },
    });
    return toSubjectPublic(row);
  },
};
