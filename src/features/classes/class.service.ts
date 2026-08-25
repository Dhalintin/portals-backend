// src/features/classes/class.service.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import type {
  CreateClassBody,
  ListClassesQuery,
  UpdateClassBody,
} from "./class.dto";
import { normalizeArm } from "../../utils/normalization";
import { toClassPublic } from "../../utils/toClassPublic";

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) {
    throw new ForbiddenError("No school context");
  }
  return schoolId;
}

export const classService = {
  async list(schoolId: string | null | undefined, query: ListClassesQuery) {
    const organizationId = requireSchoolId(schoolId);

    const where: Prisma.ClassWhereInput = {
      organizationId,
    };

    if (query.isActive === "true") where.isActive = true;
    if (query.isActive === "false") where.isActive = false;
    // "all" → no isActive filter

    if (query.level) {
      where.level = query.level;
    }

    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { arm: { contains: q, mode: "insensitive" } },
        { level: { contains: q, mode: "insensitive" } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.class.count({ where }),
      prisma.class.findMany({
        where,
        orderBy: [{ name: "asc" }, { arm: "asc" }],
        skip,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toClassPublic),
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

    const row = await prisma.class.findFirst({
      where: { id, organizationId },
    });

    if (!row) {
      throw new NotFoundError("Class not found");
    }

    return toClassPublic(row);
  },

  async create(schoolId: string | null | undefined, input: CreateClassBody) {
    const organizationId = requireSchoolId(schoolId);
    const arm = normalizeArm(input.arm);

    try {
      const row = await prisma.class.create({
        data: {
          organizationId,
          name: input.name,
          arm,
          level: input.level ?? null,
          isActive: true,
        },
      });
      return toClassPublic(row);
    } catch (err: unknown) {
      // Unique: @@unique([organizationId, name, arm])
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        throw new ConflictError(
          "A class with this name and arm already exists in your school"
        );
      }
      throw err;
    }
  },

  async update(
    schoolId: string | null | undefined,
    id: string,
    input: UpdateClassBody
  ) {
    const organizationId = requireSchoolId(schoolId);

    const existing = await prisma.class.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundError("Class not found");
    }

    try {
      const row = await prisma.class.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.arm !== undefined ? { arm: normalizeArm(input.arm) } : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      return toClassPublic(row);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        throw new ConflictError(
          "A class with this name and arm already exists in your school"
        );
      }
      throw err;
    }
  },

  /** Soft-delete by default */
  async remove(schoolId: string | null | undefined, id: string) {
    const organizationId = requireSchoolId(schoolId);

    const existing = await prisma.class.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundError("Class not found");
    }

    const row = await prisma.class.update({
      where: { id },
      data: { isActive: false },
    });

    return toClassPublic(row);
  },
};
