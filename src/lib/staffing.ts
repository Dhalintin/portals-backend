import { rolesWhere } from "../auth/rbac";
import type { Prisma } from "@prisma/client";
import { AppError } from "./errors";

export const TEACHING_ROLES = ["TEACHER", "EXAM_OFFICER", "PRINCIPAL", "SCHOOL_ADMIN", "PROPRIETOR", "STAFF"] as const;

export async function requireTeachingMember(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const membership = await tx.membership.findFirst({ where: { organizationId, userId, isActive: true,
    user: { isActive: true }, ...rolesWhere(TEACHING_ROLES) } });
  if (!membership) throw new AppError(400, "INVALID_TEACHER", "User is not an active teaching staff member of this school");
  return membership;
}

export async function requireCurriculum(tx: Prisma.TransactionClient, organizationId: string, classId: string, subjectId: string) {
  const linked = await tx.classSubject.findFirst({ where: { organizationId, classId, subjectId,
    class: { organizationId, isActive: true }, subject: { organizationId, isActive: true } } });
  if (!linked) throw new AppError(400, "SUBJECT_NOT_LINKED", "An active class and subject on its curriculum are required");
  return linked;
}

export async function clearStaffAssignments(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  await tx.class.updateMany({ where: { organizationId, classTeacherId: userId }, data: { classTeacherId: null } });
  await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
}
