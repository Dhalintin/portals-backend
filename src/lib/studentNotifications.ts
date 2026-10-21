import { createHash, randomUUID } from "node:crypto";
import type { AttendanceRecord, AttendanceStatus, NotificationType, Prisma, Result, Receipt } from "@prisma/client";

type StudentEvent = {
  organizationId: string; studentId: string; type: NotificationType; entityType: string; entityId: string;
  revision: string; title: string; summary: string; expiresAt?: Date; details?: Prisma.InputJsonObject;
};
async function linkedParents(tx: Prisma.TransactionClient, organizationId: string, studentIds: string[]) {
  return tx.parentStudent.findMany({ where: { organizationId, studentId: { in: studentIds },
    student: { organizationId, isActive: true }, parent: { organizationId, isActive: true, email: { not: null } } },
    select: { studentId: true, parent: { select: { email: true } } } });
}
async function enqueueStudentEvents(tx: Prisma.TransactionClient, organizationId: string, events: StudentEvent[]) {
  if (!events.length) return;
  const ids = [...new Set(events.map(event => event.studentId))];
  const students = await tx.student.findMany({ where: { organizationId, id: { in: ids }, isActive: true, organization: { isActive: true } },
    select: { id: true, firstName: true, lastName: true, organization: { select: { name: true } } } });
  const byId = new Map(students.map(student => [student.id, student]));
  const parents = await linkedParents(tx, organizationId, ids), seen = new Set<string>();
  const data: Prisma.NotificationOutboxCreateManyInput[] = [];
  for (const event of events) {
    const student = byId.get(event.studentId); if (!student) continue;
    for (const link of parents) {
      if (link.studentId !== event.studentId) continue;
      const recipient = link.parent.email!.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) continue;
      const recipientKey = createHash("sha256").update(recipient).digest("hex");
      const eventKey = `${event.entityType}:${event.entityId}:${event.revision}:${recipientKey}`;
      if (seen.has(eventKey)) continue; seen.add(eventKey);
      data.push({ organizationId, eventKey, type: event.type, entityType: event.entityType, entityId: event.entityId,
        channel: "email", recipient, title: `${student.organization.name}: ${event.title}`,
        body: `${student.organization.name}\n\n${student.firstName} ${student.lastName}\n${event.summary}\n\nSign in to your school portal for details.`,
        expiresAt: event.expiresAt ?? new Date(Date.now() + 7 * 86400000),
        payload: { schoolosStudentEvent: true, studentId: student.id, ...event.details } });
    }
  }
  if (data.length) await tx.notificationOutbox.createMany({ data, skipDuplicates: true });
}

export async function syncAttendanceNotifications(tx: Prisma.TransactionClient, organizationId: string,
  changes: { previousStatus?: AttendanceStatus; record: AttendanceRecord }[]) {
  const merged = new Map<string, { previousStatus?: AttendanceStatus; record: AttendanceRecord }>();
  for (const change of changes) {
    const first = merged.get(change.record.id);
    merged.set(change.record.id, { previousStatus: first ? first.previousStatus : change.previousStatus, record: change.record });
  }
  const changed = [...merged.values()].filter(change => change.previousStatus !== change.record.status);
  if (!changed.length) return;
  await tx.notificationOutbox.updateMany({ where: { organizationId, entityType: "AttendanceRecord", entityId: { in: changed.map(change => change.record.id) }, status: "PENDING" },
    data: { status: "CANCELLED", lockedAt: null, error: "ATTENDANCE_CHANGED" } });
  await enqueueStudentEvents(tx, organizationId, changed.filter(({ record }) => ["ABSENT", "LATE"].includes(record.status)).map(({ record }) => ({
    organizationId, studentId: record.studentId, type: "ATTENDANCE_ABSENCE", entityType: "AttendanceRecord", entityId: record.id,
    revision: randomUUID(), title: "Attendance notice", summary: `Marked ${record.status.toLowerCase()} on ${record.date.toISOString().slice(0, 10)}.`,
    expiresAt: new Date(Date.now() + 2 * 86400000), details: { attendanceStatus: record.status },
  })));
}

export async function enqueueResultPublications(tx: Prisma.TransactionClient, organizationId: string, results: Result[]) {
  if (!results.length) return;
  const terms = await tx.term.findMany({ where: { id: { in: [...new Set(results.map(result => result.termId))] }, session: { organizationId } }, select: { id: true, name: true } });
  const names = new Map(terms.map(term => [term.id, term.name]));
  await enqueueStudentEvents(tx, organizationId, results.map(result => ({ organizationId, studentId: result.studentId,
    type: "RESULT_PUBLISHED", entityType: "Result", entityId: result.id, revision: randomUUID(), title: "Results published",
    summary: `Results for ${names.get(result.termId) ?? "the term"} are now available.`, details: { publishedAt: result.publishedAt?.toISOString() ?? null },
  })));
}

export async function enqueueReceipt(tx: Prisma.TransactionClient, organizationId: string, receipt: Receipt, studentId: string) {
  await enqueueStudentEvents(tx, organizationId, [{ organizationId, studentId, type: "RECEIPT", entityType: "Receipt", entityId: receipt.id,
    revision: receipt.id, title: "Payment receipt", summary: `Payment allocation received: NGN ${receipt.amountNgn.toLocaleString("en-NG")}. Receipt: ${receipt.receiptNumber}.` }]);
}

export async function studentNotificationIsCurrent(tx: Prisma.TransactionClient, job: {
  organizationId: string; recipient: string; entityType: string | null; entityId: string | null; payload: Prisma.JsonValue | null;
}) {
  const payload = job.payload as Record<string, unknown> | null;
  if (payload?.schoolosStudentEvent !== true) return true;
  if (typeof payload.studentId !== "string" || !job.entityId) return false;
  const links = await linkedParents(tx, job.organizationId, [payload.studentId]);
  if (!links.some(link => link.parent.email?.trim().toLowerCase() === job.recipient.trim().toLowerCase())) return false;
  if (job.entityType === "AttendanceRecord" && !["ABSENT", "LATE"].includes(String(payload.attendanceStatus))) return false;
  if (job.entityType === "AttendanceRecord") return !!await tx.attendanceRecord.findFirst({ where: { id: job.entityId,
    organizationId: job.organizationId, studentId: payload.studentId, status: payload.attendanceStatus as AttendanceStatus } });
  if (job.entityType === "Result") return !!await tx.result.findFirst({ where: { id: job.entityId, organizationId: job.organizationId,
    studentId: payload.studentId, status: "PUBLISHED", isPublished: true, publishedAt: typeof payload.publishedAt === "string" ? new Date(payload.publishedAt) : null } });
  if (job.entityType === "Receipt") return !!await tx.receipt.findFirst({ where: { id: job.entityId, organizationId: job.organizationId, voidedAt: null,
    payment: { organizationId: job.organizationId, status: "SUCCESSFUL" }, invoice: { organizationId: job.organizationId, studentId: payload.studentId } } });
  return false;
}
