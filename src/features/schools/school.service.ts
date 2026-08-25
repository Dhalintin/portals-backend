// src/features/schools/school.service.ts
import { prisma } from "../../lib/prisma";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../common/errors/AppError";
import type { UpdateSchoolBody } from "./school.dto";
import type { SchoolPublic } from "./school.types";
import type { Organization } from "@prisma/client";
import { toSchoolPublic } from "../../utils/toPublic";

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) {
    throw new ForbiddenError(
      "No school context. Select or create a school first."
    );
  }
  return schoolId;
}

export const schoolService = {
  async getMe(schoolId: string | null | undefined) {
    const id = requireSchoolId(schoolId);

    const org = await prisma.organization.findFirst({
      where: { id, isActive: true },
    });

    if (!org) {
      throw new NotFoundError("School not found");
    }

    return toSchoolPublic(org);
  },

  async updateMe(
    schoolId: string | null | undefined,
    userId: string | undefined,
    input: UpdateSchoolBody
  ) {
    if (!userId) throw new UnauthorizedError();
    const id = requireSchoolId(schoolId);

    const org = await prisma.organization.findFirst({
      where: { id, isActive: true },
    });

    if (!org) {
      throw new NotFoundError("School not found");
    }

    // Only school_admin (and exam_officer if you want) should PATCH — enforced in routes
    const updated = await prisma.organization.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.primaryColor !== undefined
          ? { primaryColor: input.primaryColor }
          : {}),
        ...(input.accentColor !== undefined
          ? { accentColor: input.accentColor }
          : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.motto !== undefined ? { motto: input.motto } : {}),
        ...(input.schoolType !== undefined
          ? { schoolType: input.schoolType }
          : {}),
      },
    });

    return toSchoolPublic(updated);
  },
};
