// src/features/teachers/teacher.service.ts
import { OrgRole, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { requireTeachingMember, requireCurriculum } from "../../lib/staffing";
import { classesService } from "../classes/classes.service";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import type {
  ListTeachersQuery,
  SetAssignmentsBody,
  SetClassSubjectTeacherBody,
  SetClassTeacherBody,
  UpdateTeacherBody,
} from "./teacher.dto";
import type { TeacherPublic } from "./teacher.types";

const STAFF_ROLES: OrgRole[] = [OrgRole.TEACHER, OrgRole.EXAM_OFFICER];

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) throw new ForbiddenError("No school context");
  return schoolId;
}

function displayClass(name: string, arm: string | null) {
  return arm ? `${name} ${arm}` : name;
}

function mapRole(role: OrgRole): "TEACHER" | "EXAM_OFFICER" {
  if (role === OrgRole.EXAM_OFFICER) return "EXAM_OFFICER";
  return "TEACHER";
}

async function loadTeacherInOrg(organizationId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId,
      role: { in: STAFF_ROLES },
    },
    include: {
      user: true,
    },
  });
  if (!membership) throw new NotFoundError("Teacher not found in this school");
  return membership;
}

async function toTeacherPublic(
  organizationId: string,
  userId: string
): Promise<TeacherPublic> {
  const membership = await loadTeacherInOrg(organizationId, userId);
  const { user } = membership;

  const [subjectAssignments, classTeacherOf] = await Promise.all([
    prisma.classSubjectTeacher.findMany({
      where: { organizationId, userId },
      include: { class: true, subject: true },
      orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
    }),
    prisma.class.findMany({
      where: { organizationId, classTeacherId: userId, isActive: true },
      orderBy: [{ name: "asc" }, { arm: "asc" }],
    }),
  ]);

  return {
    id: user.id,
    membershipId: membership.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: mapRole(membership.role),
    isActive: membership.isActive && user.isActive,
    joinedAt: membership.joinedAt,
    assignments: subjectAssignments.map((a) => ({
      id: a.id,
      classId: a.classId,
      className: a.class.name,
      classArm: a.class.arm,
      classDisplayName: displayClass(a.class.name, a.class.arm),
      subjectId: a.subjectId,
      subjectName: a.subject.name,
    })),
    classTeacherOf: classTeacherOf.map((c) => ({
      id: c.id,
      name: c.name,
      arm: c.arm,
      displayName: displayClass(c.name, c.arm),
    })),
  };
}

export const teacherService = {
  async list(schoolId: string | null | undefined, query: ListTeachersQuery) {
    const organizationId = requireSchoolId(schoolId);

    const where: Prisma.MembershipWhereInput = {
      organizationId,
      role: query.role ? (query.role as OrgRole) : { in: STAFF_ROLES },
    };

    if (query.isActive === "true") where.isActive = true;
    if (query.isActive === "false") where.isActive = false;

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    if (query.classTeacherAvailable === "true") {
      const assigned = await prisma.class.findMany({
        where: { organizationId, classTeacherId: { not: null } },
        select: { classTeacherId: true },
      });

      let assignedIds = assigned
        .map((c) => c.classTeacherId)
        .filter((id): id is string => Boolean(id));

      // Allow current form teacher of *this* class to still appear in the select
      if (query.includeUserId) {
        assignedIds = assignedIds.filter((id) => id !== query.includeUserId);
      }

      if (assignedIds.length > 0) {
        where.userId = { notIn: assignedIds };
      }
    }

    const [total, rows] = await Promise.all([
      prisma.membership.count({ where }),
      prisma.membership.findMany({
        where,
        include: { user: true },
        orderBy: { joinedAt: "desc" },
        skip,
        take: Number(pageSize),
      }),
    ]);

    const items = await Promise.all(
      rows.map((m) => toTeacherPublic(organizationId, m.userId))
    );

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  },

  async getById(schoolId: string | null | undefined, userId: string) {
    const organizationId = requireSchoolId(schoolId);
    return toTeacherPublic(organizationId, userId);
  },

  async update(
    schoolId: string | null | undefined,
    userId: string,
    input: UpdateTeacherBody
  ) {
    const organizationId = requireSchoolId(schoolId);
    await schoolTransaction(organizationId, async tx => {
      const membership = await tx.membership.findFirst({ where: { organizationId, userId, role: { in: STAFF_ROLES } } });
      if (!membership) throw new NotFoundError("Teacher not found in this school");
      await tx.membership.update({ where: { id: membership.id }, data: input });
      if (input.isActive === false) {
        await tx.class.updateMany({ where: { organizationId, classTeacherId: userId }, data: { classTeacherId: null } });
        await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
      }
    });
    return toTeacherPublic(organizationId, userId);
  },

  /** Soft-remove from school staff */
  async remove(schoolId: string | null | undefined, userId: string) {
    const organizationId = requireSchoolId(schoolId);
    return this.update(organizationId, userId, { isActive: false });
  },

  /** Replace subject-teacher rows for this teacher */
  async setAssignments(
    schoolId: string | null | undefined,
    userId: string,
    input: SetAssignmentsBody
  ) {
    const organizationId = requireSchoolId(schoolId);
    await schoolTransaction(organizationId, async tx => {
      const member = await requireTeachingMember(tx, organizationId, userId);
      if (!STAFF_ROLES.includes(member.role)) throw new NotFoundError("Teacher not found in this school");
      for (const assignment of input.assignments) {
        await requireCurriculum(tx, organizationId, assignment.classId, assignment.subjectId);
        const current = await tx.classSubjectTeacher.findUnique({ where: { classId_subjectId: assignment } });
        if (current && current.userId !== userId) {
          throw new ConflictError("A requested class subject already has another teacher; use the class assignment endpoint to replace them");
        }
      }
      await tx.classSubjectTeacher.deleteMany({ where: { organizationId, userId } });
      if (input.assignments.length) await tx.classSubjectTeacher.createMany({ data: input.assignments.map(a => ({ ...a, organizationId, userId })) });
    });
    return toTeacherPublic(organizationId, userId);
  },

  async getMyAssignments(schoolId: string | null | undefined, userId: string) {
    const organizationId = requireSchoolId(schoolId);
    // Teacher may only read self; admin can use getById
    return toTeacherPublic(organizationId, userId);
  },

  /** Class form teacher */
  async setClassTeacher(
    schoolId: string | null | undefined,
    classId: string,
    input: SetClassTeacherBody
  ) {
    const organizationId = requireSchoolId(schoolId);

    const updated = await classesService.assignClassTeacher(organizationId, classId, { classTeacherId: input.teacherId });
    return { classId: updated.id, classTeacher: updated.classTeacher };
  },
  /** One subject teacher for one class */
  async setClassSubjectTeacher(
    schoolId: string | null | undefined,
    classId: string,
    input: SetClassSubjectTeacherBody
  ) {
    const organizationId = requireSchoolId(schoolId);

    if (input.teacherId === null) {
      await classesService.clearSubjectTeacher(organizationId, classId, input.subjectId);
    } else {
      await classesService.assignSubjectTeacher(organizationId, classId, input.subjectId, { userId: input.teacherId });
    }
    return { classId, subjectId: input.subjectId, teacherId: input.teacherId };
  },
  async listClassSubjectTeachers(
    schoolId: string | null | undefined,
    classId: string
  ) {
    const organizationId = requireSchoolId(schoolId);

    const cls = await prisma.class.findFirst({
      where: { id: classId, organizationId },
    });
    if (!cls) throw new NotFoundError("Class not found");

    const subjects = await prisma.subject.findMany({
      where: { organizationId, isActive: true, classSubjects: { some: { organizationId, classId } } },
      orderBy: { name: "asc" },
    });

    const assigned = await prisma.classSubjectTeacher.findMany({
      where: { classId, organizationId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const bySubject = new Map(assigned.map((a) => [a.subjectId, a]));

    return {
      items: subjects.map((s) => {
        const a = bySubject.get(s.id);
        return {
          subjectId: s.id,
          subjectName: s.name,
          teacherId: a?.userId ?? null,
          teacherName: a
            ? `${a.user.firstName} ${a.user.lastName}`.trim()
            : null,
        };
      }),
    };
  },
};
