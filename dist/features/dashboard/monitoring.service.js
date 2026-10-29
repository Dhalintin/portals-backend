"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceWindow = attendanceWindow;
exports.attendanceOverview = attendanceOverview;
exports.resultProgress = resultProgress;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const resourceAccess_1 = require("../../auth/resourceAccess");
function attendanceWindow(period, today, term) {
    const to = new Date(today + 'T00:00:00.000Z');
    let from = new Date(to);
    if (period === 'week')
        from.setUTCDate(from.getUTCDate() - ((from.getUTCDay() + 6) % 7));
    if (period === 'term') {
        if (!term?.startDate || !term.endDate)
            throw new errors_1.AppError(400, 'TERM_DATES_REQUIRED', 'Set the current term start and end dates in School year to view term attendance.');
        if (term.endDate < term.startDate)
            throw new errors_1.AppError(400, 'INVALID_TERM_DATES', 'The term end date must be on or after its start date.');
        from = new Date(term.startDate.toISOString().slice(0, 10) + 'T00:00:00.000Z');
        if (term.endDate && term.endDate < to)
            to.setTime(new Date(term.endDate.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime());
    }
    if (period === 'term' && from > to)
        throw new errors_1.AppError(400, 'TERM_NOT_STARTED', 'The current term has not started yet.');
    return { from, to };
}
async function attendanceOverview(auth, period) {
    const organizationId = auth.schoolId;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const term = period === 'term' ? await prisma_1.prisma.term.findFirst({ where: { isCurrent: true, session: { organizationId } }, select: { startDate: true, endDate: true } }) : null;
    const { from, to } = attendanceWindow(period, today, term);
    const classes = await prisma_1.prisma.class.findMany({ where: { organizationId, isActive: true, ...(0, resourceAccess_1.teachingClassFilter)(auth, 'attendance') }, select: { id: true, name: true, arm: true, _count: { select: { students: { where: { organizationId, isActive: true } } } } }, orderBy: [{ name: 'asc' }, { arm: 'asc' }] });
    const records = await prisma_1.prisma.attendanceRecord.groupBy({ by: ['classId', 'date', 'status'], where: { organizationId, classId: { in: classes.map(c => c.id) }, date: { gte: from, lte: to } }, _count: { _all: true } });
    const rows = classes.map(cls => {
        const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        const days = new Set();
        let todayMarked = 0;
        for (const record of records.filter(r => r.classId === cls.id)) {
            counts[record.status] += record._count._all;
            days.add(record.date.toISOString().slice(0, 10));
            if (record.date.toISOString().slice(0, 10) === today)
                todayMarked += record._count._all;
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return { id: cls.id, name: [cls.name, cls.arm].filter(Boolean).join(' '), students: cls._count.students, ...counts, total, daysRecorded: days.size, todayMarked, rate: total ? Math.round((counts.PRESENT + counts.LATE) / total * 1000) / 10 : null };
    });
    const totals = rows.reduce((a, r) => ({ present: a.present + r.PRESENT, absent: a.absent + r.ABSENT, late: a.late + r.LATE, excused: a.excused + r.EXCUSED, total: a.total + r.total, students: a.students + r.students }), { present: 0, absent: 0, late: 0, excused: 0, total: 0, students: 0 });
    return { period, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), today, totals: { ...totals, rate: totals.total ? Math.round((totals.present + totals.late) / totals.total * 1000) / 10 : null }, classes: rows };
}
async function resultProgress(auth, termId) {
    const organizationId = auth.schoolId;
    if (!await prisma_1.prisma.term.findFirst({ where: { id: termId, session: { organizationId } }, select: { id: true } }))
        throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    const classes = await prisma_1.prisma.class.findMany({ where: { organizationId, isActive: true, ...(0, resourceAccess_1.teachingClassFilter)(auth) }, select: { id: true, name: true, arm: true, subjects: { where: { organizationId, subject: { organizationId, isActive: true } }, select: { subject: { select: { id: true, name: true } } } } }, orderBy: [{ name: 'asc' }, { arm: 'asc' }] });
    const students = await prisma_1.prisma.student.findMany({ where: { organizationId, isActive: true, classId: { in: classes.map(c => c.id) } }, select: { id: true, classId: true, firstName: true, lastName: true, admissionNumber: true, results: { where: { organizationId, termId }, include: { scores: true } } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    const rows = classes.map(cls => {
        const roster = students.filter(s => s.classId === cls.id);
        const reports = roster.map(student => {
            const result = student.results.find(r => r.classId === cls.id);
            const completed = cls.subjects.filter(({ subject }) => result?.scores.some(score => score.subjectId === subject.id && score.ca1 !== null && score.ca2 !== null && score.exam !== null && score.total !== null)).length;
            return { studentId: student.id, name: [student.firstName, student.lastName].join(' '), admissionNumber: student.admissionNumber, resultId: result?.id ?? null, status: result?.status ?? null, isPublished: result?.isPublished ?? false, completed, expected: cls.subjects.length };
        });
        const subjects = cls.subjects.map(({ subject }) => ({ ...subject, expected: roster.length, completed: roster.filter(s => s.results.some(r => r.classId === cls.id && r.scores.some(score => score.subjectId === subject.id && score.ca1 !== null && score.ca2 !== null && score.exam !== null && score.total !== null))).length }));
        const expected = roster.length * subjects.length, completed = reports.reduce((sum, r) => sum + r.completed, 0);
        return { id: cls.id, name: [cls.name, cls.arm].filter(Boolean).join(' '), students: roster.length, expected, completed, completeReports: reports.filter(r => r.expected > 0 && r.completed === r.expected).length, submitted: reports.filter(r => r.status === 'SUBMITTED').length, approved: reports.filter(r => r.status === 'APPROVED' && !r.isPublished).length, published: reports.filter(r => r.isPublished).length, subjects, reports };
    });
    const totals = rows.reduce((a, r) => ({ students: a.students + r.students, expected: a.expected + r.expected, completed: a.completed + r.completed, completeReports: a.completeReports + r.completeReports, submitted: a.submitted + r.submitted, approved: a.approved + r.approved, published: a.published + r.published }), { students: 0, expected: 0, completed: 0, completeReports: 0, submitted: 0, approved: 0, published: 0 });
    return { termId, rosterBasis: 'Current active students and current class subjects', totals, classes: rows };
}
