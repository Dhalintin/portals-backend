const bcrypt = require('bcryptjs');
const { assertTestDatabaseUrl } = require('../../scripts/test-database.cjs');

const fixtureId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function schoolFixture(label, base) {
  return {
    label, id: fixtureId(base + 1), slug: `schoolos-test-${label.toLowerCase()}`,
    sessionId: fixtureId(base + 2), termId: fixtureId(base + 3), secondTermId: fixtureId(base + 4),
    classId: fixtureId(base + 5), otherClassId: fixtureId(base + 6), subjectId: fixtureId(base + 7),
    ownerId: fixtureId(base + 10), teacherId: fixtureId(base + 11), parentUserId: fixtureId(base + 12),
    bursarId: fixtureId(base + 13), parentId: fixtureId(base + 14),
    studentId: fixtureId(base + 30), otherStudentId: fixtureId(base + 31), unassignedStudentId: fixtureId(base + 32),
    publishedResultId: fixtureId(base + 40), draftResultId: fixtureId(base + 41),
    ownDraftResultId: fixtureId(base + 42), unassignedResultId: fixtureId(base + 43),
    invoiceId: fixtureId(base + 50), categoryId: fixtureId(base + 51), structureId: fixtureId(base + 52),
    attendanceId: fixtureId(base + 70), base,
  };
}
const fixtures = { a: schoolFixture('A', 100), b: schoolFixture('B', 200) };
const DEFAULT_TEST_PASSWORD = 'SchoolOSTest123!';
const gradeBands = [
  { min: 70, max: 100, grade: 'A', remark: 'Excellent' },
  { min: 60, max: 69, grade: 'B', remark: 'Very Good' },
  { min: 50, max: 59, grade: 'C', remark: 'Good' },
  { min: 45, max: 49, grade: 'D', remark: 'Pass' },
  { min: 40, max: 44, grade: 'E', remark: 'Fair' },
  { min: 0, max: 39, grade: 'F', remark: 'Fail' },
];

async function seed(prisma) {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== url) {
    throw new Error('Seeding requires NODE_ENV=test and DATABASE_URL matching the explicit TEST_DATABASE_URL.');
  }
  const actual = await prisma.$queryRaw`SELECT current_database() AS database`;
  if (actual[0].database !== decodeURIComponent(new URL(url).pathname.slice(1))) {
    throw new Error('Refusing to seed a connection to a different database.');
  }
  const passwordHash = await bcrypt.hash(DEFAULT_TEST_PASSWORD, 10);
  await prisma.$transaction(async tx => {
    async function put(model, id, data) {
      return tx[model].upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const fixture of Object.values(fixtures)) {
      const f = fixture;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.id})::bigint)`;
      const people = [
        [f.ownerId, 'owner', 'PROPRIETOR'], [f.teacherId, 'teacher', 'TEACHER'],
        [f.parentUserId, 'parent', 'PARENT'], [f.bursarId, 'bursar', 'BURSAR'],
      ];
      for (const [id, name] of people) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auth:${id}`})::bigint)`;
        const person = { email: `${name}.${f.label.toLowerCase()}@example.test`, passwordHash,
          firstName: `${f.label} ${name}`, lastName: 'Fixture', globalRole: 'USER', isActive: true };
        await tx.user.upsert({ where: { id }, create: { id, ...person },
          update: { ...person, authVersion: { increment: 1 } } });
        await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.passwordResetToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
      }
      await put('organization', f.id, {
        name: `SchoolOS Test School ${f.label}`, slug: f.slug, createdById: f.ownerId,
        isActive: true, onBoarded: true, primaryColor: '#123456', accentColor: '#abcdef',
      });
      await put('organizationSite', fixtureId(f.base + 54), { organizationId: f.id, heroTitle: `Welcome to Test ${f.label}` });
      await put('subscription', fixtureId(f.base + 55), { organizationId: f.id, plan: 'FREE', status: 'ACTIVE', studentCap: 100 });
      for (const [index, [userId, , role]] of people.entries()) {
        await put('membership', fixtureId(f.base + 20 + index), { userId, organizationId: f.id, role, isActive: true });
      }
      await tx.academicSession.updateMany({ where: { organizationId: f.id, isCurrent: true }, data: { isCurrent: false } });
      await tx.term.updateMany({ where: { session: { organizationId: f.id }, isCurrent: true }, data: { isCurrent: false } });
      await put('academicSession', f.sessionId, { organizationId: f.id, name: '2026/2027', isCurrent: true,
        startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31') });
      await put('term', f.termId, { sessionId: f.sessionId, name: 'FIRST', isCurrent: true });
      await put('term', f.secondTermId, { sessionId: f.sessionId, name: 'SECOND', isCurrent: false });
      await put('class', f.classId, { organizationId: f.id, name: 'Grade 1', arm: 'A', isActive: true, classTeacherId: f.teacherId });
      await put('class', f.otherClassId, { organizationId: f.id, name: 'Grade 2', arm: 'A', isActive: true, classTeacherId: null });
      await put('subject', f.subjectId, { organizationId: f.id, name: 'Mathematics', code: 'MATH', isActive: true });
      await put('classSubject', fixtureId(f.base + 57), { organizationId: f.id, classId: f.classId, subjectId: f.subjectId });
      await put('classSubject', fixtureId(f.base + 58), { organizationId: f.id, classId: f.otherClassId, subjectId: f.subjectId });
      await put('classSubjectTeacher', fixtureId(f.base + 59), {
        organizationId: f.id, classId: f.classId, subjectId: f.subjectId, userId: f.teacherId,
      });
      const students = [[f.studentId, f.classId, 'S001', 'Linked'],
        [f.otherStudentId, f.classId, 'S002', 'Unlinked'], [f.unassignedStudentId, f.otherClassId, 'S003', 'OtherClass']];
      for (const [index, [id, classId, admissionNumber, firstName]] of students.entries()) {
        await put('student', id, { organizationId: f.id, classId, admissionNumber, firstName, lastName: f.label, isActive: true });
        await put('studentEnrollment', fixtureId(f.base + 60 + index), { organizationId: f.id, studentId: id, classId, sessionId: f.sessionId });
      }
      await put('parent', f.parentId, { organizationId: f.id, userId: f.parentUserId, firstName: `${f.label} Parent`, lastName: 'Fixture',
        email: `parent.${f.label.toLowerCase()}@example.test`, isActive: true });
      await put('parentStudent', fixtureId(f.base + 56), { organizationId: f.id, parentId: f.parentId, studentId: f.studentId, relation: 'Guardian' });
      await put('gradeScale', fixtureId(f.base + 73), { organizationId: f.id, name: 'Default', isDefault: true, bands: gradeBands });
      const results = [
        [f.publishedResultId, f.studentId, f.termId, f.classId, 90, 'PUBLISHED'],
        [f.draftResultId, f.otherStudentId, f.termId, f.classId, 65, 'DRAFT'],
        [f.ownDraftResultId, f.studentId, f.secondTermId, f.classId, 0, 'DRAFT'],
        [f.unassignedResultId, f.unassignedStudentId, f.termId, f.otherClassId, 65, 'DRAFT'],
      ];
      for (const [index, [id, studentId, termId, classId, total, status]] of results.entries()) {
        const grade = total >= 70 ? 'A' : total >= 60 ? 'B' : 'F';
        await put('result', id, { organizationId: f.id, studentId, termId, classId, status,
          isPublished: status === 'PUBLISHED', publishedAt: status === 'PUBLISHED' ? new Date('2026-10-13') : null,
          totalScore: total, percentage: total, grade });
        await put('score', fixtureId(f.base + 90 + index), { resultId: id, subjectId: f.subjectId,
          ca1: total ? 10 : 0, ca2: total ? 20 : 0, exam: total ? total - 30 : 0, total, grade });
      }
      await put('feeCategory', f.categoryId, { organizationId: f.id, name: 'Tuition', isActive: true });
      await put('feeStructure', f.structureId, { organizationId: f.id, name: 'Grade 1 First Term', sessionId: f.sessionId,
        termId: f.termId, classId: f.classId, isActive: true });
      await put('feeStructureItem', fixtureId(f.base + 53), { feeStructureId: f.structureId, feeCategoryId: f.categoryId, amountNgn: 50000 });
      // Re-seeding must not erase financial balances after a test/manual payment.
      await tx.invoice.upsert({ where: { id: f.invoiceId }, create: { id: f.invoiceId,
        organizationId: f.id, studentId: f.studentId, termId: f.termId,
        invoiceNumber: 'INV-000001', totalNgn: 50000, paidNgn: 0, outstandingNgn: 50000, status: 'ISSUED' }, update: {} });
      await tx.invoiceItem.upsert({ where: { id: fixtureId(f.base + 80) }, create: {
        id: fixtureId(f.base + 80), invoiceId: f.invoiceId, feeCategoryId: f.categoryId, description: 'Tuition', amountNgn: 50000 }, update: {} });
      for (const [index, [studentId, classId]] of students.entries()) {
        await put('attendanceRecord', fixtureId(f.base + 70 + index), {
          organizationId: f.id, studentId, classId, date: new Date('2026-10-13'),
          status: index === 1 ? 'ABSENT' : 'PRESENT', recordedById: f.teacherId, clientKey: null,
        });
      }
    }
  }, { timeout: 60_000, maxWait: 10_000 });
  return fixtures;
}

async function main() {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = url;
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seed(prisma);
    console.log('Seeded SchoolOS test schools A/B, owners, teachers, parents, bursars, calendar, students, results, attendance and invoices.');
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seed, fixtures, DEFAULT_TEST_PASSWORD };
