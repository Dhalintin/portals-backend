"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExamEditor = getExamEditor;
exports.saveExamTimetable = saveExamTimetable;
exports.publishExamTimetable = publishExamTimetable;
exports.getPublishedExams = getPublishedExams;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const rbac_1 = require("../../auth/rbac");
const resourceAccess_1 = require("../../auth/resourceAccess");
const exams_validation_1 = require("./exams.validation");
const timetableKey = (organizationId, termId, kind = 'EXAM') => ({ organizationId_termId_kind: { organizationId, termId, kind } });
async function loadTerm(db, organizationId, termId) {
    const term = await db.term.findFirst({ where: { ...(termId ? { id: termId } : { isCurrent: true }), session: { organizationId } }, include: { session: { select: { name: true } } } });
    if (!term && termId)
        throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    return term;
}
function termView(term) {
    return { id: term.id, name: term.name, sessionName: term.session.name, startDate: term.startDate?.toISOString().slice(0, 10) ?? null, endDate: term.endDate?.toISOString().slice(0, 10) ?? null };
}
async function requireExamPermission(db, organizationId, actorId, permission) {
    const member = await db.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } } });
    if (!member || !(0, rbac_1.permissionsForMembership)(member).includes(permission))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Current exam management permission required');
}
async function curriculum(db, organizationId) {
    return db.classSubject.findMany({ where: { organizationId, class: { organizationId, isActive: true }, subject: { organizationId, isActive: true } }, select: { classId: true, subjectId: true, class: { select: { name: true, arm: true } }, subject: { select: { name: true } } } });
}
async function validateEntries(db, organizationId, term, entries, format) {
    if (!term.startDate || !term.endDate)
        throw new errors_1.AppError(400, 'TERM_DATES_REQUIRED', 'Ask the school administrator to set this term’s start and end dates first.');
    if (format) {
        if (format.startDate < term.startDate.toISOString().slice(0, 10) || format.startDate > term.endDate.toISOString().slice(0, 10))
            throw new errors_1.AppError(400, 'EXAM_OUTSIDE_TERM', 'The timetable start date must be within the term');
        (0, exams_validation_1.validateFormattedEntries)(entries, format);
    }
    const start = term.startDate.toISOString().slice(0, 10), end = term.endDate.toISOString().slice(0, 10);
    const links = await curriculum(db, organizationId);
    const options = new Map(links.map(link => [link.classId + ':' + link.subjectId, link]));
    const enriched = entries.map(entry => {
        const linked = options.get(entry.classId + ':' + entry.subjectId);
        if (!linked)
            throw new errors_1.AppError(400, 'SUBJECT_NOT_LINKED', 'Each exam must use an active class and a subject offered by that class. Refresh the class list.');
        if (entry.date < start || entry.date > end)
            throw new errors_1.AppError(400, 'EXAM_OUTSIDE_TERM', 'Exam dates must be between ' + start + ' and ' + end + '.');
        return { ...entry, className: [linked.class.name, linked.class.arm].filter(Boolean).join(' '), subjectName: linked.subject.name };
    });
    (0, exams_validation_1.validateExamClashes)(entries);
    return enriched.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className) || a.id.localeCompare(b.id));
}
async function audit(db, organizationId, actorId, id, operation, version) {
    await db.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'ExamTimetable', entityId: id, metadata: { operation, version } } });
}
function draftView(row) {
    return { kind: row?.kind ?? 'EXAM', format: row?.format ? exams_validation_1.timetableFormatSchema.parse(row.format) : null, title: row?.title ?? 'Exam timetable', entries: (row?.entries ?? []), version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null,
        published: row?.publishedSnapshot ? { ...row.publishedSnapshot, publishedAt: row.publishedAt, version: row.publishedVersion } : null,
        hasUnpublishedChanges: !!row?.publishedSnapshot && row.publishedVersion !== row.version };
}
async function getExamEditor(organizationId, termId, kind = 'EXAM') {
    const term = await loadTerm(prisma_1.prisma, organizationId, termId);
    if (!term)
        throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    const [row, links] = await Promise.all([prisma_1.prisma.examTimetable.findUnique({ where: timetableKey(organizationId, termId, kind) }), curriculum(prisma_1.prisma, organizationId)]);
    const classes = new Map();
    for (const link of links) {
        const option = classes.get(link.classId) ?? { id: link.classId, name: [link.class.name, link.class.arm].filter(Boolean).join(' '), subjects: [] };
        option.subjects.push({ id: link.subjectId, name: link.subject.name });
        classes.set(link.classId, option);
    }
    return { term: termView(term), timetable: { ...draftView(row), kind, title: row?.title ?? (kind === 'TEST' ? 'Test timetable' : 'Exam timetable') }, classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}
async function saveExamTimetable(organizationId, actorId, raw) {
    const input = exams_validation_1.saveTimetableSchema.parse(raw);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (db) => {
        await requireExamPermission(db, organizationId, actorId, 'exams:write');
        const current = await db.examTimetable.findUnique({ where: timetableKey(organizationId, input.termId, input.kind) });
        const format = input.format === undefined ? (current?.format ? exams_validation_1.timetableFormatSchema.parse(current.format) : null) : input.format;
        if ((current?.version ?? 0) !== input.expectedVersion) {
            // Recover a committed save after a lost response without advancing its version again.
            if (current?.title === input.title && (0, exams_validation_1.formatSignature)(current.format ? exams_validation_1.timetableFormatSchema.parse(current.format) : null) === (0, exams_validation_1.formatSignature)(format) && (0, exams_validation_1.examEntriesSignature)(current.entries) === (0, exams_validation_1.examEntriesSignature)(input.entries))
                return draftView(current);
            throw new errors_1.AppError(409, 'TIMETABLE_CHANGED', 'This timetable changed in another tab. Reload the saved draft before replacing it. Your device draft is retained.');
        }
        const term = await loadTerm(db, organizationId, input.termId);
        if (!term)
            throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
        await validateEntries(db, organizationId, term, input.entries, format);
        const data = { format: format ?? client_1.Prisma.DbNull, title: input.title, entries: input.entries, version: (current?.version ?? 0) + 1 };
        const saved = current ? await db.examTimetable.update({ where: { id: current.id }, data }) : await db.examTimetable.create({ data: { organizationId, termId: input.termId, kind: input.kind, ...data } });
        await audit(db, organizationId, actorId, saved.id, 'EXAM_TIMETABLE_SAVED', saved.version);
        return draftView(saved);
    });
}
async function publishExamTimetable(organizationId, actorId, raw, withdraw = false) {
    const input = exams_validation_1.timetableVersionSchema.parse(raw);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (db) => {
        await requireExamPermission(db, organizationId, actorId, 'exams:publish');
        const current = await db.examTimetable.findUnique({ where: timetableKey(organizationId, input.termId, input.kind) });
        if (!current)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Save the draft before publishing');
        if (current.version !== input.expectedVersion) {
            const repeatPublish = !withdraw && current.version === input.expectedVersion + 1 && current.publishedVersion === current.version;
            const repeatWithdraw = withdraw && current.version === input.expectedVersion + 1 && !current.publishedSnapshot;
            if (repeatPublish || repeatWithdraw)
                return draftView(current);
            throw new errors_1.AppError(409, 'TIMETABLE_CHANGED', 'The timetable changed. Reload and review the latest draft before publishing.');
        }
        if (withdraw && !current.publishedSnapshot)
            return draftView(current);
        const version = current.version + 1;
        let snapshot = null;
        if (!withdraw) {
            const entries = exams_validation_1.saveTimetableSchema.parse({ termId: input.termId, expectedVersion: current.version, title: current.title, entries: current.entries }).entries;
            if (!entries.length)
                throw new errors_1.AppError(400, 'EMPTY_TIMETABLE', 'Add at least one exam before publishing');
            const term = await loadTerm(db, organizationId, input.termId);
            if (!term)
                throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
            const format = current.format ? exams_validation_1.timetableFormatSchema.parse(current.format) : null;
            snapshot = { title: current.title, format, entries: await validateEntries(db, organizationId, term, entries, format) };
        }
        const saved = await db.examTimetable.update({ where: { id: current.id }, data: { version, publishedVersion: withdraw ? null : version, publishedAt: withdraw ? null : new Date(), publishedSnapshot: snapshot ? snapshot : client_1.Prisma.DbNull } });
        await audit(db, organizationId, actorId, saved.id, withdraw ? 'EXAM_TIMETABLE_WITHDRAWN' : 'EXAM_TIMETABLE_PUBLISHED', version);
        return draftView(saved);
    });
}
async function getPublishedExams(auth, raw) {
    const query = exams_validation_1.publishedQuerySchema.parse(raw), organizationId = auth.schoolId;
    let parentClassId = null;
    if (auth.orgRole === 'PARENT') {
        if (!query.studentId)
            throw new errors_1.AppError(400, 'CHILD_REQUIRED', 'Choose a child to view their exam timetable');
        await (0, resourceAccess_1.assertParentChildAccess)(auth, query.studentId);
        const student = await prisma_1.prisma.student.findFirst({ where: { organizationId, id: query.studentId }, select: { classId: true } });
        parentClassId = student?.classId ?? null;
    }
    const term = await loadTerm(prisma_1.prisma, organizationId, query.termId);
    if (!term)
        return { kind: query.kind, format: null, term: null, title: query.kind === 'TEST' ? 'Test timetable' : 'Exam timetable', publishedAt: null, entries: [] };
    const row = await prisma_1.prisma.examTimetable.findUnique({ where: timetableKey(organizationId, term.id, query.kind) });
    const snapshot = row?.publishedSnapshot;
    const visibleClasses = await prisma_1.prisma.class.findMany({ where: { organizationId, isActive: true, ...(auth.orgRole === 'PARENT' ? { id: parentClassId ?? '__none__' } : (0, resourceAccess_1.teachingClassFilter)(auth)) }, select: { id: true } });
    const classIds = new Set(visibleClasses.map(schoolClass => schoolClass.id));
    return { kind: query.kind, format: snapshot?.format ?? null, term: termView(term), title: snapshot?.title ?? (query.kind === 'TEST' ? 'Test timetable' : 'Exam timetable'), publishedAt: row?.publishedAt ?? null, entries: snapshot?.entries.filter(entry => classIds.has(entry.classId)) ?? [] };
}
