// src/features/classes/classSubject.service.ts
import { prisma } from "../../lib/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import type { SetClassSubjectsBody } from "./classSubject.dto";

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) throw new ForbiddenError("No school context");
  return schoolId;
}

async function assertClassInOrg(organizationId: string, classId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, organizationId },
  });
  if (!cls) throw new NotFoundError("Class not found");
  return cls;
}

export const classSubjectService = {
  /**
   * Subjects this class offers, plus optional subject teacher.
   */
  async listForClass(schoolId: string | null | undefined, classId: string) {
    const organizationId = requireSchoolId(schoolId);
    await assertClassInOrg(organizationId, classId);

    const rows = await prisma.classSubject.findMany({
      where: { classId, organizationId },
      include: {
        subject: true,
      },
      orderBy: { subject: { name: "asc" } },
    });

    const teachers = await prisma.classSubjectTeacher.findMany({
      where: { classId, organizationId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    const teacherBySubject = new Map(teachers.map((t) => [t.subjectId, t]));

    return {
      items: rows.map((r) => {
        const t = teacherBySubject.get(r.subjectId);
        return {
          subjectId: r.subjectId,
          name: r.subject.name,
          code: r.subject.code,
          isActive: r.subject.isActive,
          teacher: t
            ? {
                id: t.user.id,
                name: `${t.user.firstName} ${t.user.lastName}`.trim(),
                email: t.user.email,
              }
            : null,
        };
      }),
    };
  },

  /**
   * Replace full curriculum for the class.
   * Removes ClassSubjectTeacher rows for subjects no longer offered.
   */
  async setForClass(
    schoolId: string | null | undefined,
    classId: string,
    input: SetClassSubjectsBody
  ) {
    const organizationId = requireSchoolId(schoolId);
    await assertClassInOrg(organizationId, classId);
    console.log(schoolId);

    const uniqueIds = [...new Set(input.subjectIds)];

    if (uniqueIds.length) {
      const found = await prisma.subject.findMany({
        where: {
          organizationId,
          id: { in: uniqueIds },
          isActive: true,
        },
        select: { id: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestError(
          "One or more subjects are invalid or inactive for this school"
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.classSubject.deleteMany({
        where: { classId, organizationId },
      });

      if (uniqueIds.length) {
        await tx.classSubject.createMany({
          data: uniqueIds.map((subjectId) => ({
            organizationId,
            classId,
            subjectId,
          })),
        });
      }

      // Drop teaching assignments for subjects removed from curriculum
      await tx.classSubjectTeacher.deleteMany({
        where: {
          classId,
          organizationId,
          ...(uniqueIds.length ? { subjectId: { notIn: uniqueIds } } : {}),
        },
      });
    });

    return this.listForClass(organizationId, classId);
  },

  async addSubject(
    schoolId: string | null | undefined,
    classId: string,
    subjectId: string
  ) {
    const organizationId = requireSchoolId(schoolId);
    await assertClassInOrg(organizationId, classId);

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, organizationId, isActive: true },
    });
    if (!subject) throw new BadRequestError("Subject not found or inactive");

    await prisma.classSubject.upsert({
      where: {
        classId_subjectId: { classId, subjectId },
      },
      create: { organizationId, classId, subjectId },
      update: {},
    });

    return this.listForClass(organizationId, classId);
  },

  async removeSubject(
    schoolId: string | null | undefined,
    classId: string,
    subjectId: string
  ) {
    const organizationId = requireSchoolId(schoolId);
    await assertClassInOrg(organizationId, classId);

    await prisma.$transaction([
      prisma.classSubject.deleteMany({
        where: { classId, subjectId, organizationId },
      }),
      prisma.classSubjectTeacher.deleteMany({
        where: { classId, subjectId, organizationId },
      }),
    ]);

    return this.listForClass(organizationId, classId);
  },
};
