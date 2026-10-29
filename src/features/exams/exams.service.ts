import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { schoolTransaction } from '../../lib/schoolTransaction';
import { permissionsForMembership } from '../../auth/rbac';
import type { AuthContext } from '../../auth/types';
import { assertParentChildAccess, teachingClassFilter } from '../../auth/resourceAccess';
import { publishedQuerySchema, saveTimetableSchema, timetableVersionSchema, validateExamClashes, examEntriesSignature, type ExamEntry, type TimetableFormat, timetableFormatSchema, formatSignature, validateFormattedEntries } from './exams.validation';

type PublishedEntry = ExamEntry & { className: string; subjectName: string };
type PublishedSnapshot = { title: string; entries: PublishedEntry[]; format?:TimetableFormat|null };
type Db = Prisma.TransactionClient;
const timetableKey = (organizationId: string, termId: string,kind='EXAM') => ({ organizationId_termId_kind: { organizationId, termId,kind } });

async function loadTerm(db: Db, organizationId: string, termId?: string) {
  const term = await db.term.findFirst({ where: { ...(termId ? { id: termId } : { isCurrent: true }), session: { organizationId } }, include: { session: { select: { name: true } } } });
  if (!term && termId) throw new AppError(404, 'TERM_NOT_FOUND', 'Term not found');
  return term;
}
function termView(term: NonNullable<Awaited<ReturnType<typeof loadTerm>>>) {
  return { id: term.id, name: term.name, sessionName: term.session.name, startDate: term.startDate?.toISOString().slice(0, 10) ?? null, endDate: term.endDate?.toISOString().slice(0, 10) ?? null };
}
async function requireExamPermission(db: Db, organizationId: string, actorId: string, permission: 'exams:write' | 'exams:publish') {
  const member = await db.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true }, organization: { isActive: true } } });
  if (!member || !permissionsForMembership(member).includes(permission)) throw new AppError(403, 'FORBIDDEN', 'Current exam management permission required');
}
async function curriculum(db: Db, organizationId: string) {
  return db.classSubject.findMany({ where: { organizationId, class: { organizationId, isActive: true }, subject: { organizationId, isActive: true } }, select: { classId: true, subjectId: true, class: { select: { name: true, arm: true } }, subject: { select: { name: true } } } });
}
async function validateEntries(db: Db, organizationId: string, term: NonNullable<Awaited<ReturnType<typeof loadTerm>>>, entries: ExamEntry[],format?:TimetableFormat|null) {
  if (!term.startDate || !term.endDate) throw new AppError(400, 'TERM_DATES_REQUIRED', 'Ask the school administrator to set this term’s start and end dates first.');
  if(format){if(format.startDate<term.startDate.toISOString().slice(0,10)||format.startDate>term.endDate.toISOString().slice(0,10))throw new AppError(400,'EXAM_OUTSIDE_TERM','The timetable start date must be within the term');validateFormattedEntries(entries,format);}
  const start = term.startDate.toISOString().slice(0, 10), end = term.endDate.toISOString().slice(0, 10);
  const links = await curriculum(db, organizationId);
  const options = new Map(links.map(link => [link.classId + ':' + link.subjectId, link]));
  const enriched: PublishedEntry[] = entries.map(entry => {
    const linked = options.get(entry.classId + ':' + entry.subjectId);
    if (!linked) throw new AppError(400, 'SUBJECT_NOT_LINKED', 'Each exam must use an active class and a subject offered by that class. Refresh the class list.');
    if (entry.date < start || entry.date > end) throw new AppError(400, 'EXAM_OUTSIDE_TERM', 'Exam dates must be between ' + start + ' and ' + end + '.');
    return { ...entry, className: [linked.class.name, linked.class.arm].filter(Boolean).join(' '), subjectName: linked.subject.name };
  });
  validateExamClashes(entries);
  return enriched.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className) || a.id.localeCompare(b.id));
}
async function audit(db: Db, organizationId: string, actorId: string, id: string, operation: string, version: number) {
  await db.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'ExamTimetable', entityId: id, metadata: { operation, version } } });
}
function draftView(row: Awaited<ReturnType<typeof prisma.examTimetable.findUnique>>) {
  return { kind:row?.kind??'EXAM',format:row?.format?timetableFormatSchema.parse(row.format):null,title: row?.title ?? 'Exam timetable', entries: (row?.entries ?? []) as unknown as ExamEntry[], version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null,
    published: row?.publishedSnapshot ? { ...(row.publishedSnapshot as unknown as PublishedSnapshot), publishedAt: row.publishedAt, version: row.publishedVersion } : null,
    hasUnpublishedChanges: !!row?.publishedSnapshot && row.publishedVersion !== row.version };
}

export async function getExamEditor(organizationId: string, termId: string,kind='EXAM') {
  const term = await loadTerm(prisma, organizationId, termId);
  if (!term) throw new AppError(404, 'TERM_NOT_FOUND', 'Term not found');
  const [row, links] = await Promise.all([prisma.examTimetable.findUnique({ where: timetableKey(organizationId, termId,kind) }), curriculum(prisma, organizationId)]);
  const classes = new Map<string, { id: string; name: string; subjects: { id: string; name: string }[] }>();
  for (const link of links) {
    const option = classes.get(link.classId) ?? { id: link.classId, name: [link.class.name, link.class.arm].filter(Boolean).join(' '), subjects: [] };
    option.subjects.push({ id: link.subjectId, name: link.subject.name }); classes.set(link.classId, option);
  }
  return { term: termView(term), timetable: {...draftView(row),kind,title:row?.title??(kind==='TEST'?'Test timetable':'Exam timetable')}, classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function saveExamTimetable(organizationId: string, actorId: string, raw: unknown) {
  const input = saveTimetableSchema.parse(raw);
  return schoolTransaction(organizationId, async db => {
    await requireExamPermission(db, organizationId, actorId, 'exams:write');
    const current = await db.examTimetable.findUnique({ where: timetableKey(organizationId, input.termId,input.kind) });
    const format=input.format===undefined?(current?.format?timetableFormatSchema.parse(current.format):null):input.format;
    if ((current?.version ?? 0) !== input.expectedVersion) {
      // Recover a committed save after a lost response without advancing its version again.
      if (current?.title === input.title && formatSignature(current.format?timetableFormatSchema.parse(current.format):null)===formatSignature(format) && examEntriesSignature(current.entries as unknown as ExamEntry[]) === examEntriesSignature(input.entries)) return draftView(current);
      throw new AppError(409, 'TIMETABLE_CHANGED', 'This timetable changed in another tab. Reload the saved draft before replacing it. Your device draft is retained.');
    }
    const term = await loadTerm(db, organizationId, input.termId);
    if (!term) throw new AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    await validateEntries(db, organizationId, term, input.entries,format);
    const data = { format:format??Prisma.DbNull,title: input.title, entries: input.entries as Prisma.InputJsonValue, version: (current?.version ?? 0) + 1 };
    const saved = current ? await db.examTimetable.update({ where: { id: current.id }, data }) : await db.examTimetable.create({ data: { organizationId, termId: input.termId,kind:input.kind, ...data } });
    await audit(db, organizationId, actorId, saved.id, 'EXAM_TIMETABLE_SAVED', saved.version);
    return draftView(saved);
  });
}

export async function publishExamTimetable(organizationId: string, actorId: string, raw: unknown, withdraw = false) {
  const input = timetableVersionSchema.parse(raw);
  return schoolTransaction(organizationId, async db => {
    await requireExamPermission(db, organizationId, actorId, 'exams:publish');
    const current = await db.examTimetable.findUnique({ where: timetableKey(organizationId, input.termId,input.kind) });
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Save the draft before publishing');
    if (current.version !== input.expectedVersion) {
      const repeatPublish = !withdraw && current.version === input.expectedVersion + 1 && current.publishedVersion === current.version;
      const repeatWithdraw = withdraw && current.version === input.expectedVersion + 1 && !current.publishedSnapshot;
      if (repeatPublish || repeatWithdraw) return draftView(current);
      throw new AppError(409, 'TIMETABLE_CHANGED', 'The timetable changed. Reload and review the latest draft before publishing.');
    }
    if (withdraw && !current.publishedSnapshot) return draftView(current);
    const version = current.version + 1;
    let snapshot: PublishedSnapshot | null = null;
    if (!withdraw) {
      const entries = saveTimetableSchema.parse({ termId: input.termId, expectedVersion: current.version, title: current.title, entries: current.entries }).entries;
      if (!entries.length) throw new AppError(400, 'EMPTY_TIMETABLE', 'Add at least one exam before publishing');
      const term = await loadTerm(db, organizationId, input.termId);
      if (!term) throw new AppError(404, 'TERM_NOT_FOUND', 'Term not found');
      const format=current.format?timetableFormatSchema.parse(current.format):null;
      snapshot = { title: current.title, format,entries: await validateEntries(db, organizationId, term, entries,format) };
    }
    const saved = await db.examTimetable.update({ where: { id: current.id }, data: { version, publishedVersion: withdraw ? null : version, publishedAt: withdraw ? null : new Date(), publishedSnapshot: snapshot ? snapshot as unknown as Prisma.InputJsonValue : Prisma.DbNull } });
    await audit(db, organizationId, actorId, saved.id, withdraw ? 'EXAM_TIMETABLE_WITHDRAWN' : 'EXAM_TIMETABLE_PUBLISHED', version);
    return draftView(saved);
  });
}

export async function getPublishedExams(auth: AuthContext, raw: unknown) {
  const query = publishedQuerySchema.parse(raw), organizationId = auth.schoolId!;
  let parentClassId: string | null = null;
  if (auth.orgRole === 'PARENT') {
    if (!query.studentId) throw new AppError(400, 'CHILD_REQUIRED', 'Choose a child to view their exam timetable');
    await assertParentChildAccess(auth, query.studentId);
    const student = await prisma.student.findFirst({ where: { organizationId, id: query.studentId }, select: { classId: true } });
    parentClassId = student?.classId ?? null;
  }
  const term = await loadTerm(prisma, organizationId, query.termId);
  if (!term) return { kind:query.kind,format:null,term: null, title: query.kind==='TEST'?'Test timetable':'Exam timetable', publishedAt: null, entries: [] };
  const row = await prisma.examTimetable.findUnique({ where: timetableKey(organizationId, term.id,query.kind) });
  const snapshot = row?.publishedSnapshot as unknown as PublishedSnapshot | null;
  const visibleClasses = await prisma.class.findMany({ where: { organizationId, isActive: true, ...(auth.orgRole === 'PARENT' ? { id: parentClassId ?? '__none__' } : teachingClassFilter(auth)) }, select: { id: true } });
  const classIds = new Set(visibleClasses.map(schoolClass => schoolClass.id));
  return { kind:query.kind,format:snapshot?.format??null,term: termView(term), title: snapshot?.title ?? (query.kind==='TEST'?'Test timetable':'Exam timetable'), publishedAt: row?.publishedAt ?? null, entries: snapshot?.entries.filter(entry => classIds.has(entry.classId)) ?? [] };
}
