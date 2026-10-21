import type { AttendanceStatus, AttendanceRecord, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { assertTeachingAccess, teachingClassFilter } from "../../auth/resourceAccess";
import type { AuthContext } from "../../auth/types";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { syncAttendanceNotifications } from "../../lib/studentNotifications";
import type {
  MarkClassAttendanceInput,
  UpdateAttendanceInput,
  OfflineSyncInput,
} from "./attendance.validation";

function attendanceDate(value: string) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, "INVALID_DATE", "Attendance date must be a real calendar date in YYYY-MM-DD format");
  }
  return date;
}

export class AttendanceService {
  /**
   * Teacher happy-path: open class → mark all present → change exceptions → save.
   * Uses a transaction. Existing records for the same student+date are updated.
   */
  async markClassAttendance(
    organizationId: string,
    recordedById: string,
    input: MarkClassAttendanceInput,
    meta?: { requestId?: string }
  ) {
    return schoolTransaction(organizationId, async tx => {
      await assertTeachingAccess(organizationId, recordedById, input.classId, undefined, tx);
      const date = attendanceDate(input.date);
      const students = await tx.student.findMany({ where: { organizationId, classId: input.classId, isActive: true }, select: { id: true } });
      const ids = new Set(students.map(student => student.id));
      if (input.exceptions.some(exception => !ids.has(exception.studentId))) throw new AppError(400, "INVALID_STUDENT", "Attendance exception must belong to an active student in this class");
      if (new Set(input.exceptions.map(exception => exception.studentId)).size !== input.exceptions.length) throw new AppError(400, "DUPLICATE_STUDENT", "Attendance exceptions must identify each student once");
      const exceptionMap = new Map(input.exceptions.map(exception => [exception.studentId, exception]));
      const existing = await tx.attendanceRecord.findMany({ where: { organizationId, studentId: { in: [...ids] }, date } });
      const previous = new Map(existing.map(record => [record.studentId, record]));
      const changes: { previousStatus?: AttendanceStatus; record: AttendanceRecord }[] = [];
      for (const student of students) {
        const exception = exceptionMap.get(student.id), clientKey = exception?.clientKey ?? null;
        const record = await tx.attendanceRecord.upsert({ where: { studentId_date: { studentId: student.id, date } },
          create: { organizationId, studentId: student.id, classId: input.classId, date, status: exception?.status ?? input.defaultStatus,
            note: exception?.note ?? null, recordedById, clientKey },
          update: { status: exception?.status ?? input.defaultStatus, note: exception?.note ?? null, recordedById,
            ...(clientKey ? { clientKey } : {}), classId: input.classId } });
        changes.push({ previousStatus: previous.get(student.id)?.status, record });
      }
      await syncAttendanceNotifications(tx, organizationId, changes);
      await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
        entity: "AttendanceRecord", metadata: { classId: input.classId, date: input.date, count: changes.length, mode: "bulk" }, requestId: meta?.requestId } });
      return { marked: changes.length, date: input.date, classId: input.classId, records: changes.map(change => change.record) };
    });
  }
  async updateOne(
    organizationId: string,
    recordId: string,
    recordedById: string,
    input: UpdateAttendanceInput,
    meta?: { requestId?: string }
  ) {
    return schoolTransaction(organizationId, async tx => {
      const existing = await tx.attendanceRecord.findFirst({ where: { id: recordId, organizationId } });
      if (!existing) throw new AppError(404, "NOT_FOUND", "Attendance record not found");
      await assertTeachingAccess(organizationId, recordedById, existing.classId, undefined, tx);
      const updated = await tx.attendanceRecord.update({ where: { id: recordId }, data: { status: input.status,
        note: input.note === undefined ? existing.note : input.note, recordedById } });
      await syncAttendanceNotifications(tx, organizationId, [{ previousStatus: existing.status, record: updated }]);
      await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
        entity: "AttendanceRecord", entityId: recordId, metadata: { previousStatus: existing.status, newStatus: input.status }, requestId: meta?.requestId } });
      return updated;
    });
  }
  async listByClassAndDate(
    organizationId: string,
    classId: string,
    dateStr: string,
    auth?: AuthContext
  ) {
    if (auth?.orgRole === "TEACHER") await assertTeachingAccess(organizationId, auth.userId, classId);
    const date = new Date(dateStr);

    const records = await prisma.attendanceRecord.findMany({
      where: { organizationId, classId, date },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            otherNames: true,
          },
        },
      },
      orderBy: [
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
      ],
    });

    return records;
  }

  async listByStudent(
    organizationId: string,
    studentId: string,
    opts: { from?: string; to?: string; limit?: number },
    auth?: AuthContext
  ) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId, ...(auth?.orgRole === "TEACHER" ? { class: teachingClassFilter(auth) } : {}) },
      select: { id: true },
    });
    if (!student) {
      throw new AppError(404, "STUDENT_NOT_FOUND", "Student not found");
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      organizationId,
      studentId,
    };

    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(opts.from);
      if (opts.to) where.date.lte = new Date(opts.to);
    }

    return prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: "desc" },
      take: opts.limit ?? 50,
      include: {
        class: { select: { id: true, name: true, arm: true } },
      },
    });
  }

  /**
   * Offline sync: idempotent upsert by clientKey (preferred) or studentId+date.
   * Safe for retries / conflicting submissions.
   */
  async offlineSync(
    organizationId: string,
    recordedById: string,
    input: OfflineSyncInput,
    meta?: { requestId?: string }
  ) {
    const results: any = [];

    await schoolTransaction(organizationId, async (tx) => {
      for (const classId of new Set(input.records.map(record => record.classId))) await assertTeachingAccess(organizationId, recordedById, classId, undefined, tx);
      const changes: { previousStatus?: AttendanceStatus; record: AttendanceRecord }[] = [];
      for (const r of input.records) {
        const student = await tx.student.findFirst({
          where: { id: r.studentId, organizationId, classId: r.classId, isActive: true },
          select: { id: true },
        });
        if (!student) throw new AppError(400, "INVALID_STUDENT", "Student must be active in this school's class");
        // Prefer clientKey uniqueness when present
        let existing = null;
        if (r.clientKey) {
          existing = await tx.attendanceRecord.findFirst({
            where: {
              organizationId,
              clientKey: r.clientKey,
            },
          });
        }

        if (!existing) {
          existing = await tx.attendanceRecord.findFirst({
            where: {
              organizationId,
              studentId: r.studentId,
              date: attendanceDate(r.date),
            },
          });
        }

        if (existing) {
          if (existing.studentId !== r.studentId || existing.date.getTime() !== attendanceDate(r.date).getTime()) {
            throw new AppError(409, "CLIENT_KEY_CONFLICT", "clientKey already belongs to a different attendance record");
          }
          // Update only if different (or always overwrite for last-write-wins)
          const updated = await tx.attendanceRecord.update({
            where: { id: existing.id },
            data: {
              status: r.status,
              note: r.note ?? existing.note,
              recordedById,
              classId: r.classId,
              clientKey: r.clientKey ?? existing.clientKey,
            },
          });
          changes.push({ previousStatus: existing.status, record: updated });
          results.push({ action: "updated", record: updated });
        } else {
          const created = await tx.attendanceRecord.create({
            data: {
              organizationId,
              studentId: r.studentId,
              classId: r.classId,
              date: attendanceDate(r.date),
              status: r.status,
              note: r.note,
              recordedById,
              clientKey: r.clientKey,
            },
          });
          changes.push({ record: created });
          results.push({ action: "created", record: created });
        }
      }
      await syncAttendanceNotifications(tx, organizationId, changes);
      await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
        entity: "AttendanceRecord", metadata: { mode: "offline_sync", count: results.length }, requestId: meta?.requestId } });
    });
    return { synced: results.length, results };
  }

  /** Dashboard helpers */
  async absentToday(organizationId: string, dateStr?: string, auth?: AuthContext) {
    const date = dateStr ? new Date(dateStr) : new Date();
    // Normalize to date only
    date.setUTCHours(0, 0, 0, 0);

    return prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        date,
        status: { in: ["ABSENT", "LATE"] }, // or only ABSENT if preferred
        ...(auth?.orgRole === "TEACHER" ? { class: teachingClassFilter(auth) } : {}),
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
        class: { select: { id: true, name: true, arm: true } },
      },
      orderBy: { class: { name: "asc" } },
    });
  }

  async attendancePercentage(
    organizationId: string,
    opts: { from: string; to: string; classId?: string },
    auth?: AuthContext
  ) {
    const where: Prisma.AttendanceRecordWhereInput = {
      organizationId,
      ...(auth?.orgRole === "TEACHER" ? { class: teachingClassFilter(auth) } : {}),
      date: {
        gte: new Date(opts.from),
        lte: new Date(opts.to),
      },
    };
    if (opts.classId) where.classId = opts.classId;

    const [total, present] = await Promise.all([
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.count({
        where: { ...where, status: "PRESENT" },
      }),
    ]);

    const percentage =
      total === 0 ? 0 : Math.round((present / total) * 1000) / 10;

    return { total, present, percentage };
  }
}

export const attendanceService = new AttendanceService();
