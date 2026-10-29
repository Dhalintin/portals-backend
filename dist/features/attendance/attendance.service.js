"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceService = exports.AttendanceService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const studentNotifications_1 = require("../../lib/studentNotifications");
function attendanceDate(value) {
    const date = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new errors_1.AppError(400, "INVALID_DATE", "Attendance date must be a real calendar date in YYYY-MM-DD format");
    }
    return date;
}
class AttendanceService {
    /**
     * Teacher happy-path: open class → mark all present → change exceptions → save.
     * Uses a transaction. Existing records for the same student+date are updated.
     */
    async markClassAttendance(organizationId, recordedById, input, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            await (0, resourceAccess_1.assertClassTeacher)(organizationId, recordedById, input.classId, tx);
            const date = attendanceDate(input.date);
            const students = await tx.student.findMany({ where: { organizationId, classId: input.classId, isActive: true }, select: { id: true } });
            const ids = new Set(students.map(student => student.id));
            if (input.exceptions.some(exception => !ids.has(exception.studentId)))
                throw new errors_1.AppError(400, "INVALID_STUDENT", "Attendance exception must belong to an active student in this class");
            if (new Set(input.exceptions.map(exception => exception.studentId)).size !== input.exceptions.length)
                throw new errors_1.AppError(400, "DUPLICATE_STUDENT", "Attendance exceptions must identify each student once");
            const exceptionMap = new Map(input.exceptions.map(exception => [exception.studentId, exception]));
            const existing = await tx.attendanceRecord.findMany({ where: { organizationId, studentId: { in: [...ids] }, date } });
            const previous = new Map(existing.map(record => [record.studentId, record]));
            const changes = [];
            for (const student of students) {
                const exception = exceptionMap.get(student.id), clientKey = exception?.clientKey ?? null;
                const record = await tx.attendanceRecord.upsert({ where: { studentId_date: { studentId: student.id, date } },
                    create: { organizationId, studentId: student.id, classId: input.classId, date, status: exception?.status ?? input.defaultStatus,
                        note: exception?.note ?? null, recordedById, clientKey },
                    update: { status: exception?.status ?? input.defaultStatus, note: exception?.note ?? null, recordedById,
                        ...(clientKey ? { clientKey } : {}), classId: input.classId } });
                changes.push({ previousStatus: previous.get(student.id)?.status, record });
            }
            await (0, studentNotifications_1.syncAttendanceNotifications)(tx, organizationId, changes);
            await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
                    entity: "AttendanceRecord", metadata: { classId: input.classId, date: input.date, count: changes.length, mode: "bulk" }, requestId: meta?.requestId } });
            return { marked: changes.length, date: input.date, classId: input.classId, records: changes.map(change => change.record) };
        });
    }
    async updateOne(organizationId, recordId, recordedById, input, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const existing = await tx.attendanceRecord.findFirst({ where: { id: recordId, organizationId } });
            if (!existing)
                throw new errors_1.AppError(404, "NOT_FOUND", "Attendance record not found");
            await (0, resourceAccess_1.assertClassTeacher)(organizationId, recordedById, existing.classId, tx);
            const updated = await tx.attendanceRecord.update({ where: { id: recordId }, data: { status: input.status,
                    note: input.note === undefined ? existing.note : input.note, recordedById } });
            await (0, studentNotifications_1.syncAttendanceNotifications)(tx, organizationId, [{ previousStatus: existing.status, record: updated }]);
            await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
                    entity: "AttendanceRecord", entityId: recordId, metadata: { previousStatus: existing.status, newStatus: input.status }, requestId: meta?.requestId } });
            return updated;
        });
    }
    async listByClassAndDate(organizationId, classId, dateStr, auth) {
        if ((0, resourceAccess_1.restrictedTeachingRead)(auth, 'attendance') && !await prisma_1.prisma.class.findFirst({ where: { id: classId, isActive: true, ...(0, resourceAccess_1.teachingClassFilter)(auth, 'attendance') }, select: { id: true } }))
            throw new errors_1.AppError(403, 'FORBIDDEN', 'You are not assigned to this class');
        const date = new Date(dateStr);
        const records = await prisma_1.prisma.attendanceRecord.findMany({
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
    async listByStudent(organizationId, studentId, opts, auth) {
        const student = await prisma_1.prisma.student.findFirst({
            where: { id: studentId, organizationId, ...((0, resourceAccess_1.restrictedTeachingRead)(auth, 'attendance') ? { class: (0, resourceAccess_1.teachingClassFilter)(auth, 'attendance') } : {}) },
            select: { id: true },
        });
        if (!student) {
            throw new errors_1.AppError(404, "STUDENT_NOT_FOUND", "Student not found");
        }
        const where = {
            organizationId,
            studentId,
        };
        if (opts.from || opts.to) {
            where.date = {};
            if (opts.from)
                where.date.gte = new Date(opts.from);
            if (opts.to)
                where.date.lte = new Date(opts.to);
        }
        return prisma_1.prisma.attendanceRecord.findMany({
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
    async offlineSync(organizationId, recordedById, input, meta) {
        const results = [];
        await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            for (const classId of new Set(input.records.map(record => record.classId)))
                await (0, resourceAccess_1.assertClassTeacher)(organizationId, recordedById, classId, tx);
            const changes = [];
            for (const r of input.records) {
                const student = await tx.student.findFirst({
                    where: { id: r.studentId, organizationId, classId: r.classId, isActive: true },
                    select: { id: true },
                });
                if (!student)
                    throw new errors_1.AppError(400, "INVALID_STUDENT", "Student must be active in this school's class");
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
                        throw new errors_1.AppError(409, "CLIENT_KEY_CONFLICT", "clientKey already belongs to a different attendance record");
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
                }
                else {
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
            await (0, studentNotifications_1.syncAttendanceNotifications)(tx, organizationId, changes);
            await tx.auditLog.create({ data: { action: "ATTENDANCE_MODIFIED", actorId: recordedById, organizationId,
                    entity: "AttendanceRecord", metadata: { mode: "offline_sync", count: results.length }, requestId: meta?.requestId } });
        });
        return { synced: results.length, results };
    }
    /** Dashboard helpers */
    async absentToday(organizationId, dateStr, auth) {
        const date = dateStr ? new Date(dateStr) : new Date();
        // Normalize to date only
        date.setUTCHours(0, 0, 0, 0);
        return prisma_1.prisma.attendanceRecord.findMany({
            where: {
                organizationId,
                date,
                status: { in: ["ABSENT", "LATE"] }, // or only ABSENT if preferred
                ...((0, resourceAccess_1.restrictedTeachingRead)(auth, 'attendance') ? { class: (0, resourceAccess_1.teachingClassFilter)(auth, 'attendance') } : {}),
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
    async attendancePercentage(organizationId, opts, auth) {
        const where = {
            organizationId,
            ...((0, resourceAccess_1.restrictedTeachingRead)(auth, 'attendance') ? { class: (0, resourceAccess_1.teachingClassFilter)(auth, 'attendance') } : {}),
            date: {
                gte: new Date(opts.from),
                lte: new Date(opts.to),
            },
        };
        if (opts.classId)
            where.classId = opts.classId;
        const [total, present] = await Promise.all([
            prisma_1.prisma.attendanceRecord.count({ where }),
            prisma_1.prisma.attendanceRecord.count({
                where: { ...where, status: "PRESENT" },
            }),
        ]);
        const percentage = total === 0 ? 0 : Math.round((present / total) * 1000) / 10;
        return { total, present, percentage };
    }
}
exports.AttendanceService = AttendanceService;
exports.attendanceService = new AttendanceService();
