import type { AuthContext } from "./types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

export async function assertTeachingAccess(
  organizationId: string, actorId: string, classId: string, subjectId?: string, db: Prisma.TransactionClient = prisma
) {
  const membership = await db.membership.findFirst({
    where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } },
  });
  if (!membership || membership.role === "PARENT") {
    throw new AppError(403, "FORBIDDEN", "Staff membership required");
  }
  const schoolClass = await db.class.findFirst({ where: { id: classId, organizationId, isActive: true } });
  if (!schoolClass) throw new AppError(404, "CLASS_NOT_FOUND", "Class not found");
  if (subjectId) {
    const linked = await db.classSubject.findFirst({
      where: { organizationId, classId, subjectId, subject: { organizationId, isActive: true } },
    });
    if (!linked) throw new AppError(400, "SUBJECT_NOT_LINKED", "Subject is not offered by this class");
  }
  if (membership.role !== "TEACHER") return;
  const assignment = await db.classSubjectTeacher.findFirst({
    where: { organizationId, classId, userId: actorId, ...(subjectId ? { subjectId } : {}) },
  });
  const allowed = subjectId ? !!assignment : schoolClass.classTeacherId === actorId || !!assignment;
  if (!allowed) throw new AppError(403, "FORBIDDEN", "You are not assigned to this class or subject");
}

export async function assertClassTeacher(organizationId: string, actorId: string, classId: string, db: Prisma.TransactionClient = prisma) {
  await assertTeachingAccess(organizationId, actorId, classId, undefined, db);
  const assigned = await db.class.findFirst({ where: { id: classId, organizationId, isActive: true, classTeacherId: actorId } });
  if (!assigned) throw new AppError(403, "FORBIDDEN", "Only the assigned class teacher can mark attendance");
}
export async function assertSubjectTeacher(organizationId: string, actorId: string, classId: string, subjectId: string, db: Prisma.TransactionClient = prisma) {
  await assertTeachingAccess(organizationId, actorId, classId, subjectId, db);
  const assigned = await db.classSubjectTeacher.findFirst({ where: { organizationId, classId, subjectId, userId: actorId } });
  if (!assigned) throw new AppError(403, "FORBIDDEN", "Only the assigned subject teacher can enter scores");
}

export async function assertParentChildAccess(auth: AuthContext, studentId: string) {
  const link = await prisma.parentStudent.findFirst({
    where: {
      organizationId: auth.schoolId!, studentId,
      parent: { organizationId: auth.schoolId!, userId: auth.userId, isActive: true },
      student: { organizationId: auth.schoolId! },
    },
  });
  if (!link) throw new AppError(404, "NOT_FOUND", "Child record not found");
}

export function teachingClassFilter(auth?: AuthContext): Prisma.ClassWhereInput {
  return auth?.orgRole === "TEACHER" ? {
    organizationId: auth.schoolId!,
    OR: [
      { classTeacherId: auth.userId },
      { subjectTeachers: { some: { organizationId: auth.schoolId!, userId: auth.userId } } },
    ],
  } : {};
}
