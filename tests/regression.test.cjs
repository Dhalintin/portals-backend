const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

// No production credentials or database are used by these regression tests.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/schoolos_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-'.repeat(3);
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-'.repeat(3);
process.env.PAYSTACK_SECRET_KEY = 'test-paystack-secret';
// Prisma model delegates are proxies; use an explicit fake module instead of
// patching their descriptors. Unexpected database access fails immediately.
const unexpectedQuery = async () => { throw new Error('Unexpected database query in regression test'); };
const prisma = { $transaction: unexpectedQuery, $executeRaw: unexpectedQuery, $queryRaw: unexpectedQuery };
for (const model of ['user', 'membership', 'class', 'classSubject', 'classSubjectTeacher',
  'parentStudent', 'parent', 'student', 'attendanceRecord', 'result', 'score', 'gradeScale',
  'auditLog', 'payment', 'paymentAllocation', 'invoice', 'receipt', 'notificationOutbox',
  'subject', 'feeStructure', 'invoiceBatch', 'feeCategory', 'subscription', 'academicSession', 'term', 'authSession']) {
  prisma[model] = Object.fromEntries(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findMany',
    'create', 'createMany', 'update', 'updateMany', 'upsert', 'count', 'aggregate', 'groupBy', 'delete', 'deleteMany']
    .map(method => [method, unexpectedQuery]));
}
prisma.feeStructure.findMany=async()=>[];
prisma.schoolBankAccount={findUnique:async()=>null};
const prismaPath = require.resolve('../.test-build/lib/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };
const dotenvConfigPath = require.resolve('dotenv/config');
require.cache[dotenvConfigPath] = { id: dotenvConfigPath, filename: dotenvConfigPath, loaded: true, exports: {} };
const { validate } = require('../.test-build/middlewares/validate');
const { authenticate } = require('../.test-build/middlewares/authenticate');
const { requireStaff } = require('../.test-build/middlewares/requireStaff');
const { authorize, requireSchoolContext } = require('../.test-build/common/middleware/authorize');
const { assertParentChildAccess, assertTeachingAccess } = require('../.test-build/auth/resourceAccess');
const { signAccessToken } = require('../.test-build/auth/jwt');
const { z } = require('zod');
const { attendanceService } = require('../.test-build/features/attendance/attendance.service');
const { resultsService } = require('../.test-build/features/results/results.service');
const { feesService } = require('../.test-build/features/fees/fees.service');
const { communicationService } = require('../.test-build/features/communication/communication.service');
const { studentsService } = require('../.test-build/features/students/students.service');
const paystack = require('../.test-build/lib/paystack');

afterEach(() => mock.restoreAll());
test('invoice tracking filters remain school scoped and search before pagination', async () => {
  let query;
  mock.method(prisma.invoice, 'findMany', async input => { query = input; return []; });
  for (const paymentState of ['owing', 'unpaid', 'partial', 'paid']) {
    await feesService.listInvoices('school-a', { paymentState, search: 'Ada', offset: 50, limit: 50 });
    assert.equal(query.where.organizationId, 'school-a');
    assert.deepEqual(query.where.status, { notIn: ['CANCELLED', 'DRAFT'] });
    assert.equal(query.skip, 50);
    assert.equal(query.take, 50);
    assert.equal(query.where.OR[1].student.firstName.contains, 'Ada');
    assert.equal(query.where.OR[1].student.firstName.mode, 'insensitive');
    assert.deepEqual(query.where.outstandingNgn, paymentState === 'paid' ? 0 : { gt: 0 });
    if (paymentState === 'unpaid') assert.equal(query.where.paidNgn, 0);
    if (paymentState === 'partial') assert.deepEqual(query.where.paidNgn, { gt: 0 });
  }
  await feesService.listInvoices('school-b', { paymentState: 'all' });
  assert.deepEqual(query.where, { organizationId: 'school-b' });
});
test('invoice query validation bounds search and pagination', () => {
  const { listInvoicesQuerySchema } = require('../.test-build/features/fees/fees.validation');
  assert.equal(listInvoicesQuerySchema.parse({ offset: '50', paymentState: 'partial' }).offset, 50);
  for (const input of [{ offset: -1 }, { offset: 1.5 }, { search: 'x'.repeat(101) }, { paymentState: 'invalid' }]) {
    assert.equal(listInvoicesQuerySchema.safeParse(input).success, false);
  }
});
test('legacy authorization uses the current session role and never a conflicting older user role', async () => {
  await middleware(authorize('TEACHER'), { auth: { orgRole: 'TEACHER', globalRole: 'USER', schoolId: 'school-a' } });
  await assert.rejects(middleware(authorize('SCHOOL_ADMIN'), {
    auth: { orgRole: 'PARENT', globalRole: 'USER', schoolId: 'school-a' }, user: { role: 'SCHOOL_ADMIN' },
  }), { statusCode: 403 });
  await middleware(requireSchoolContext, { auth: { schoolId: 'school-a' } });
  await assert.rejects(middleware(requireSchoolContext, { auth: { schoolId: null }, user: { schoolId: 'school-a' } }), { statusCode: 403 });
});
function fakeTransactions() {
  mock.method(prisma, '$transaction', async work => work(prisma));
  mock.method(prisma, '$executeRaw', async () => 1);
}
function allowTeacher() {
  mock.method(prisma.membership, 'findFirst', async () => ({ role: 'TEACHER' }));
  mock.method(prisma.class, 'findFirst', async () => ({ id: 'class-a', classTeacherId: 'teacher-a' }));
  mock.method(prisma.classSubject, 'findFirst', async () => ({ id: 'link-a' }));
  mock.method(prisma.classSubjectTeacher, 'findFirst', async () => ({ id: 'assignment-a' }));
}
async function withServer(app, work) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function middleware(handler, req, res = { locals: {} }) {
  return new Promise((resolve, reject) => {
    Promise.resolve(handler(req, res, error => error ? reject(error) : resolve())).catch(reject);
  });
}

test('validation preserves body transforms, query defaults and separately validated params', async () => {
  const req = { body: { name: '  Jane  ', ignored: true }, params: { id: 'x' } };
  Object.setPrototypeOf(req, { get query() { return {}; } });
  const res = { locals: {} };
  await middleware(validate(z.object({ page: z.coerce.number().default(1) }), 'query'), req, res);
  await middleware(validate(z.object({ id: z.string() }), 'params'), req, res);
  await middleware(validate(z.object({ name: z.string().trim() })), req, res);
  assert.deepEqual(req.query, { page: 1 });
  assert.deepEqual(req.body, { name: 'Jane' });
  assert.deepEqual(res.locals.validatedBySource.params, { id: 'x' });
});

test('authentication recomputes current permissions instead of trusting stale owner claims', async () => {
  mock.method(prisma.user, 'findUnique', async () => ({ id: 'user-a', isActive: true, globalRole: 'USER', authVersion: 0 }));
  mock.method(prisma.authSession, 'findFirst', async () => ({ id: 'session-a' }));
  mock.method(prisma.membership, 'findFirst', async () => ({ role: 'TEACHER' }));
  const token = signAccessToken({ sub: 'user-a', sid: 'session-a', authVersion: 0, globalRole: 'USER', schoolId: 'school-a', orgRole: 'PROPRIETOR', permissions: ['results:publish'] });
  const req = { headers: { authorization: `Bearer ${token}` } };
  await middleware(authenticate, req);
  assert.equal(req.auth.orgRole, 'TEACHER');
  assert.equal(req.auth.permissions.includes('results:publish'), false);
});

test('a revoked membership rejects an unexpired access token', async () => {
  mock.method(prisma.user, 'findUnique', async () => ({ id: 'user-a', isActive: true, globalRole: 'USER', authVersion: 0 }));
  mock.method(prisma.authSession, 'findFirst', async () => ({ id: 'session-a' }));
  const membership = mock.method(prisma.membership, 'findFirst', async () => null);
  const token = signAccessToken({ sub: 'user-a', sid: 'session-a', authVersion: 0, globalRole: 'USER', schoolId: 'school-a', orgRole: 'TEACHER', permissions: [] });
  await assert.rejects(middleware(authenticate, { headers: { authorization: `Bearer ${token}` } }), { statusCode: 401 });
  assert.equal(membership.mock.calls[0].arguments[0].where.organization.isActive, true);
});

test('parents cannot use staff APIs and child ownership is scoped to the school and user', async () => {
  await assert.rejects(middleware(requireStaff, { auth: { orgRole: 'PARENT' } }), { statusCode: 403 });
  const lookup = mock.method(prisma.parentStudent, 'findFirst', async () => null);
  await assert.rejects(assertParentChildAccess({ schoolId: 'school-a', userId: 'parent-a' }, 'other-child'), { statusCode: 404 });
  const where = lookup.mock.calls[0].arguments[0].where;
  assert.equal(where.organizationId, 'school-a');
  assert.equal(where.parent.userId, 'parent-a');
  assert.equal(where.student.organizationId, 'school-a');
});

test('parent result and fee lists remain reachable while general lists return 403', async () => {
  const authModule = require('../.test-build/middlewares/authenticate');
  mock.method(authModule, 'authenticate', (req, _res, next) => {
    req.auth = { userId: 'parent-a', schoolId: 'school-a', orgRole: 'PARENT', permissions: ['results:read', 'fees:read'] };
    next();
  });
  mock.method(resultsService, 'parentResults', async () => []);
  mock.method(feesService, 'parentFees', async () => ({ invoices: [] }));
  const app = express();
  app.use('/results', require('../.test-build/features/results/results.routes').default);
  app.use('/fees', require('../.test-build/features/fees/fees.routes').default);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ code: error.code }));
  await withServer(app, async base => {
    assert.equal((await fetch(`${base}/results/parent/me`)).status, 200);
    assert.equal((await fetch(`${base}/fees/parent/me`)).status, 200);
    assert.equal((await fetch(`${base}/results`)).status, 403);
    assert.equal((await fetch(`${base}/fees/invoices`)).status, 403);
  });
});

test('class teachers cannot enter scores for subjects assigned to someone else', async () => {
  allowTeacher();
  mock.method(prisma.classSubjectTeacher, 'findFirst', async () => null);
  await assert.rejects(assertTeachingAccess('school-a', 'teacher-a', 'class-a', 'subject-b'), { statusCode: 403 });
});

test('offline sync rejects foreign-school students before touching attendance', async () => {
  fakeTransactions(); allowTeacher();
  mock.method(prisma.student, 'findFirst', async () => null);
  const writes = mock.method(prisma.attendanceRecord, 'update', async () => assert.fail('Unexpected write'));
  await assert.rejects(attendanceService.offlineSync('school-a', 'teacher-a', {
    records: [{ studentId: 'foreign-child', classId: 'class-a', date: '2026-10-13', status: 'PRESENT' }],
  }), { code: 'INVALID_STUDENT' });
  assert.equal(writes.mock.callCount(), 0);
});

test('offline sync rejects reused client keys for different students', async () => {
  fakeTransactions(); allowTeacher();
  mock.method(prisma.student, 'findFirst', async () => ({ id: 'child-a' }));
  mock.method(prisma.attendanceRecord, 'findFirst', async () => ({ id: 'record-b', studentId: 'child-b', date: new Date('2026-10-13') }));
  await assert.rejects(attendanceService.offlineSync('school-a', 'teacher-a', {
    records: [{ studentId: 'child-a', classId: 'class-a', date: '2026-10-13', status: 'PRESENT', clientKey: 'reused' }],
  }), { code: 'CLIENT_KEY_CONFLICT' });
});

test('partial score edits retain old components and decimal marks receive the correct grade', async () => {
  fakeTransactions(); allowTeacher();
  mock.method(prisma.result, 'findFirst', async () => ({ id: 'result-a', classId: 'class-a', status: 'DRAFT' }));
  mock.method(prisma.gradeScale, 'findFirst', async () => null);
  mock.method(prisma.score, 'findUnique', async () => ({ ca1: 10, ca2: 15, exam: 40 }));
  const save = mock.method(prisma.score, 'upsert', async input => input.update);
  mock.method(prisma.score, 'findMany', async () => [{ total: 69.5 }]);
  mock.method(prisma.result, 'update', async () => ({}));
  mock.method(prisma.auditLog, 'create', async () => ({}));
  await resultsService.upsertScores('school-a', 'result-a', [{ subjectId: 'subject-a', exam: 44.5 }], 'teacher-a');
  const data = save.mock.calls[0].arguments[0].update;
  assert.equal(data.ca1, 10); assert.equal(data.ca2, 15);
  assert.equal(data.total, 69.5); assert.equal(data.grade, 'B');
});

test('teachers cannot approve or publish a result through the transition service', async () => {
  allowTeacher();
  await assert.rejects(resultsService.transitionStatus('school-a', 'result-a', 'APPROVED', 'teacher-a'), { statusCode: 403 });
  await assert.rejects(resultsService.transitionStatus('school-a', 'result-a', 'PUBLISHED', 'teacher-a'), { statusCode: 403 });
});

test('Paystack signatures verify exact bytes and reject malformed signatures', () => {
  const body = Buffer.from('{ "event": "charge.success" }');
  const signature = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  assert.equal(paystack.verifyPaystackSignature(body, signature), true);
  assert.equal(paystack.verifyPaystackSignature(Buffer.from('{"event":"charge.success"}'), signature), false);
  assert.equal(paystack.verifyPaystackSignature(body, 'bad'), false);
});

test('the mounted webhook receives original bytes before the general JSON parser', async () => {
  mock.method(require('dotenv'), 'configDotenv', () => ({ parsed: {} }));
  const expected = '{ "event": "charge.success", "data": {} }';
  mock.method(feesService, 'handlePaystackWebhook', async body => {
    assert.ok(Buffer.isBuffer(body)); assert.equal(body.toString(), expected);
    return { status: 'tested' };
  });
  const app = express();
  require('../.test-build/middlewares/index.middleware').default(app);
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/payments/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: expected,
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
  });
});

test('a successful provider charge with a mismatched amount is never credited', async () => {
  mock.method(prisma.payment, 'findFirst', async () => ({ id: 'payment-a', organizationId: 'school-a', status: 'PENDING', amountNgn: 100 }));
  mock.method(paystack, 'verifyTransaction', async () => ({ status: 'success', amount: 9900, currency: 'NGN', reference: 'ref-a' }));
  const transaction = mock.method(prisma, '$transaction', async () => assert.fail('Unexpected credit'));
  await assert.rejects(feesService.finalizePaystackPayment('ref-a'), { code: 'PAYMENT_MISMATCH' });
  assert.equal(transaction.mock.callCount(), 0);
});

test('finalization rechecks successful status after acquiring the school lock', async () => {
  fakeTransactions();
  mock.method(prisma.payment, 'findFirst', async () => ({ id: 'payment-a', organizationId: 'school-a', status: 'PENDING', amountNgn: 100 }));
  mock.method(prisma.payment, 'findUniqueOrThrow', async () => ({ id: 'payment-a', status: 'SUCCESSFUL' }));
  const update = mock.method(prisma.payment, 'update', async () => assert.fail('Duplicate credit'));
  mock.method(paystack, 'verifyTransaction', async () => ({ status: 'success', amount: 10000, currency: 'NGN', reference: 'ref-a' }));
  mock.method(prisma.auditLog, 'create', async () => ({}));
  await feesService.finalizePaystackPayment('ref-a');
  assert.equal(update.mock.callCount(), 0);
});

test('allocation rejects amounts beyond the remaining payment balance', async () => {
  fakeTransactions();
  mock.method(prisma.payment, 'findFirst', async () => ({ id: 'payment-a', status: 'SUCCESSFUL', amountNgn: 100 }));
  mock.method(prisma.paymentAllocation, 'findMany', async () => [{ amountNgn: 80 }]);
  await assert.rejects(feesService.allocatePayment('school-a', 'payment-a', [{ invoiceId: 'invoice-a', amountNgn: 30 }], 'bursar-a'), { code: 'OVER_ALLOCATION' });
});

test('notification previews are school-scoped and do not mark messages as delivered', async () => {
  const lookup = mock.method(prisma.notificationOutbox, 'findMany', async () => [{ id: 'n-a', channel: 'whatsapp', recipient: 'test', body: 'preview' }]);
  const update = mock.method(prisma.notificationOutbox, 'update', async () => assert.fail('Preview must not mutate delivery status'));
  const result = await communicationService.processOutbox(20, 'school-a');
  assert.equal(lookup.mock.calls[0].arguments[0].where.organizationId, 'school-a');
  assert.equal(result[0].simulated, true); assert.equal(result[0].status, 'PENDING');
  assert.equal(update.mock.callCount(), 0);
});

test('teacher result reads include an assignment filter even through report card services', async () => {
  const auth = { schoolId: 'school-a', userId: 'teacher-a', orgRole: 'TEACHER' };
  const lookup = mock.method(prisma.result, 'findFirst', async () => null);
  await assert.rejects(resultsService.reportCardPayload('school-a', 'result-b', auth), { statusCode: 404 });
  const where = lookup.mock.calls[0].arguments[0].where;
  assert.equal(where.organizationId, 'school-a');
  assert.equal(where.class.OR[0].classTeacherId, 'teacher-a');
});

test('score edits above 100 are rejected before persisting', async () => {
  fakeTransactions(); allowTeacher();
  mock.method(prisma.result, 'findFirst', async () => ({ id: 'result-a', classId: 'class-a', status: 'DRAFT' }));
  mock.method(prisma.gradeScale, 'findFirst', async () => null);
  mock.method(prisma.score, 'findUnique', async () => ({ ca1: 20, ca2: 20, exam: 50 }));
  const save = mock.method(prisma.score, 'upsert', async () => assert.fail('Invalid total persisted'));
  await assert.rejects(resultsService.upsertScores('school-a', 'result-a', [{ subjectId: 'subject-a', exam: 70 }], 'teacher-a'), { code: 'INVALID_SCORE' });
  assert.equal(save.mock.callCount(), 0);
});

test('submitted and approved result scores must return to draft before edits', async () => {
  mock.method(prisma.result, 'findFirst', async () => ({ id: 'result-a', status: 'APPROVED' }));
  await assert.rejects(resultsService.upsertScores('school-a', 'result-a', [], 'teacher-a'), { code: 'LOCKED' });
});

test('invoice generation rejects explicit students from another school', async () => {
  fakeTransactions();
  mock.method(prisma.invoiceBatch, 'findUnique', async () => null);
  mock.method(prisma.feeStructure, 'findFirst', async () => ({ isActive: true, classId: 'class-a' }));
  mock.method(prisma.student, 'findMany', async () => []);
  await assert.rejects(feesService.generateInvoices('school-a', {
    idempotencyKey: 'foreign-student-test', feeStructureId: '00000000-0000-4000-8000-000000000001',
    studentIds: ['00000000-0000-4000-8000-000000000002'],
  }, 'bursar-a'), { code: 'INVALID_STUDENTS' });
});

test('pending Paystack verification does not turn a pending payment into failure', async () => {
  mock.method(prisma.payment, 'findFirst', async () => ({ id: 'payment-a', status: 'PENDING' }));
  mock.method(paystack, 'verifyTransaction', async () => ({ status: 'pending' }));
  const update = mock.method(prisma.payment, 'updateMany', async () => assert.fail('Pending verification must not fail the payment'));
  const result = await feesService.finalizePaystackPayment('ref-a');
  assert.equal(result.status, 'pending'); assert.equal(update.mock.callCount(), 0);
});

test('closed payments cannot be revived by a repeated provider notification', async () => {
  mock.method(prisma.payment, 'findFirst', async () => ({ id: 'payment-a', status: 'REFUNDED' }));
  mock.method(paystack, 'verifyTransaction', async () => assert.fail('Closed payment must not be verified or credited'));
  assert.equal((await feesService.finalizePaystackPayment('closed-reference')).reason, 'payment_closed');
});

test('student cap is rechecked inside the school transaction after the initial precheck', async () => {
  fakeTransactions();
  mock.method(prisma.subscription, 'findUnique', async () => ({ studentCap: 2 }));
  let countCalls = 0;
  mock.method(prisma.student, 'count', async () => ++countCalls === 1 ? 1 : 2);
  const create = mock.method(prisma.student, 'create', async () => assert.fail('Cap exceeded'));
  await assert.rejects(studentsService.create('school-a', 'admin-a', {
    admissionNumber: 'A001', firstName: 'Jane', lastName: 'Doe',
  }), { code: 'STUDENT_CAP_REACHED' });
  assert.equal(create.mock.callCount(), 0); assert.equal(countCalls, 2);
});

test('proxy trust accepts explicit networks and refuses blanket trust or hop counts', () => {
  const { parseTrustProxy } = require('../.test-build/config/trustProxy');
  assert.equal(parseTrustProxy('false'), false);
  assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8, 2001:db8::/32'), ['loopback', '10.0.0.0/8', '2001:db8::/32']);
  for (const input of ['true', '1', '', '*', '0.0.0.0/0', '::/0', '127.0.0.1/33', '::1/129', '127.0.0.1/8/extra']) {
    assert.throws(() => parseTrustProxy(input), /TRUST_PROXY/);
  }
});


test('read-only entry sheets include unmarked students and scope all reads to school, term and subject',async()=>{
 allowTeacher();
 mock.method(prisma.term,'findFirst',async query=>{assert.deepEqual(query.where,{id:'term-a',session:{organizationId:'school-a'}});return {id:'term-a'};});
 mock.method(prisma.subject,'findFirst',async query=>{assert.deepEqual(query.where,{id:'subject-a',organizationId:'school-a',isActive:true});return {id:'subject-a',name:'Math',code:null};});
 mock.method(prisma.student,'findMany',async query=>{assert.deepEqual(query.where,{organizationId:'school-a',classId:'class-a',isActive:true});assert.deepEqual(query.select.results.where,{organizationId:'school-a',termId:'term-a'});assert.deepEqual(query.select.results.select.scores.where,{subjectId:'subject-a'});return [{id:'student-a',firstName:'Ada',lastName:'Obi',otherNames:null,admissionNumber:'A1',results:[]},{id:'student-b',firstName:'Ben',lastName:'Obi',results:[{id:'result-b',status:'SUBMITTED',scores:[{id:'score-b',ca1:10,ca2:20,exam:40,total:70,grade:'A',remark:'Good'}]}]}];});
 const sheet=await resultsService.entrySheet('school-a','teacher-a',{classId:'class-a',termId:'term-a',subjectId:'subject-a'});
 assert.equal(sheet.students.length,2);assert.equal(sheet.students[0].ca1,null);assert.equal(sheet.students[0].resultId,null);assert.equal(sheet.students[1].status,'SUBMITTED');assert.equal(sheet.students[1].total,70);
});
test('entry sheets reject an unassigned subject before reading student data',async()=>{allowTeacher();mock.method(prisma.classSubjectTeacher,'findFirst',async()=>null);await assert.rejects(resultsService.entrySheet('school-a','teacher-a',{classId:'class-a',termId:'term-a',subjectId:'subject-b'}),{code:'FORBIDDEN'});});
test('entry sheets reject a term from another school before reading the roster',async()=>{allowTeacher();mock.method(prisma.term,'findFirst',async()=>null);await assert.rejects(resultsService.entrySheet('school-a','teacher-a',{classId:'class-a',termId:'term-b',subjectId:'subject-a'}),{code:'TERM_NOT_FOUND'});});

test('announcement writers including principals can list drafts, while readers cannot',async()=>{
 const {communicationController}=require('../.test-build/features/communication/communication.controller');
 const calls=[];mock.method(communicationService,'listAnnouncements',async(schoolId,options)=>{calls.push({schoolId,options});return [];});
 for(const [role,permissions] of [['PRINCIPAL',['announcements:read','announcements:write']],['TEACHER',['announcements:read']]]){
  let failure;const res={status(){return this;},json(){return this;}};
  await communicationController.listAnnouncements({query:{},auth:{schoolId:'school-a',orgRole:role,permissions}},res,error=>{failure=error;});
  assert.equal(failure,undefined);
 }
 assert.equal(calls[0].options.isAdmin,true);assert.equal(calls[1].options.isAdmin,false);assert.ok(calls.every(call=>call.schoolId==='school-a'));
});

const {attendanceWindow,attendanceOverview,resultProgress}=require('../.test-build/features/dashboard/monitoring.service');
test('owner attendance windows use Monday to date and require an explicit term start',()=>{
 assert.equal(attendanceWindow('week','2026-10-28').from.toISOString().slice(0,10),'2026-10-26');
 assert.equal(attendanceWindow('week','2026-11-01').from.toISOString().slice(0,10),'2026-10-26');
 assert.throws(()=>attendanceWindow('term','2026-10-28',null),e=>e.code==='TERM_DATES_REQUIRED');
 const range=attendanceWindow('term','2026-10-28',{startDate:new Date('2026-09-07'),endDate:new Date('2026-10-23')});
 assert.equal(range.from.toISOString().slice(0,10),'2026-09-07');assert.equal(range.to.toISOString().slice(0,10),'2026-10-23');
});
test('owner attendance aggregates marks without inventing absences or leaking other classes',async()=>{
 let groupQuery;
 mock.method(prisma.class,'findMany',async input=>{assert.equal(input.where.organizationId,'school-a');return [{id:'class-a',name:'SS 1',arm:null,_count:{students:10}}];});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 mock.method(prisma.attendanceRecord,'groupBy',async input=>{groupQuery=input;return [{classId:'class-a',date:new Date(today),status:'PRESENT',_count:{_all:3}},{classId:'class-a',date:new Date(today),status:'LATE',_count:{_all:1}},{classId:'class-a',date:new Date(today),status:'ABSENT',_count:{_all:1}}];});
 const data=await attendanceOverview({schoolId:'school-a',orgRole:'PROPRIETOR',userId:'owner'},'day');
 assert.equal(groupQuery.where.organizationId,'school-a');assert.deepEqual(groupQuery.where.classId,{in:['class-a']});
 assert.equal(data.totals.students,10);assert.equal(data.totals.total,5);assert.equal(data.totals.absent,1);assert.equal(data.totals.rate,80);assert.equal(data.classes[0].todayMarked,5);
});
test('result progress counts the entire roster beyond 200 and distinguishes incomplete scores from zero marks',async()=>{
 mock.method(prisma.term,'findFirst',async input=>{assert.equal(input.where.session.organizationId,'school-a');return {id:'term-a'};});
 mock.method(prisma.class,'findMany',async input=>{assert.equal(input.where.organizationId,'school-a');return [{id:'class-a',name:'SS 1',arm:null,subjects:[{subject:{id:'math',name:'Math'}},{subject:{id:'english',name:'English'}}]}];});
 mock.method(prisma.student,'findMany',async input=>{
  assert.equal(input.where.organizationId,'school-a');assert.equal(input.select.results.where.termId,'term-a');assert.equal(input.take,undefined);
  return Array.from({length:205},(_,i)=>({id:'student-'+i,classId:'class-a',firstName:'Student',lastName:String(i),admissionNumber:String(i),results:[{id:'result-'+i,classId:'class-a',status:i<100?'PUBLISHED':i<200?'APPROVED':'DRAFT',isPublished:i<100,scores:[{subjectId:'math',ca1:0,ca2:0,exam:0,total:0},{subjectId:'english',ca1:10,ca2:10,exam:i<200?30:null,total:i<200?50:null}]}]}));
 });
 const data=await resultProgress({schoolId:'school-a',orgRole:'PROPRIETOR',userId:'owner'},'term-a');
 assert.equal(data.totals.students,205);assert.equal(data.totals.expected,410);assert.equal(data.totals.completed,405);assert.equal(data.totals.completeReports,200);assert.equal(data.totals.approved,100);assert.equal(data.totals.published,100);assert.equal(data.classes[0].reports.length,205);assert.equal(data.classes[0].subjects[0].completed,205);
});
test('result progress rejects foreign terms before looking up school records',async()=>{
 mock.method(prisma.term,'findFirst',async()=>null);
 await assert.rejects(()=>resultProgress({schoolId:'school-a',orgRole:'PROPRIETOR',userId:'owner'},'foreign-term'),e=>e.statusCode===404||e.status===404);
});
const {groupStudentBalances,studentBalances}=require('../.test-build/features/fees/studentBalances');
test('student balances combine paid and unpaid bills before student status filtering',async()=>{
 const student={firstName:'Ada',lastName:'Obi',admissionNumber:'A1',class:{name:'SS 1',arm:'A'}};
 const bills=[{id:'tuition',studentId:'student-a',invoiceNumber:'TUITION-1',totalNgn:12000,paidNgn:12000,outstandingNgn:0,student,items:[{description:'Tuition',amountNgn:12000}]},{id:'pta',studentId:'student-a',invoiceNumber:'PTA-1',totalNgn:3500,paidNgn:0,outstandingNgn:3500,student,items:[{description:'PTA',amountNgn:3500}]}];
 const grouped=groupStudentBalances(bills);assert.equal(grouped.length,1);assert.equal(grouped[0].totalNgn,15500);assert.equal(grouped[0].paidNgn,12000);assert.equal(grouped[0].outstandingNgn,3500);assert.equal(grouped[0].bills.length,2);
 mock.method(prisma.term,'findFirst',async()=>({id:'00000000-0000-4000-8000-000000000001'}));
 mock.method(prisma.invoice,'findMany',async input=>{assert.equal(input.where.organizationId,'school-a');assert.equal(input.where.termId,'00000000-0000-4000-8000-000000000001');assert.deepEqual(input.where.status,{notIn:['CANCELLED','DRAFT']});assert.equal(input.where.outstandingNgn,undefined);assert.equal(input.take,undefined);assert.equal(input.skip,undefined);return bills;});
 const query={termId:'00000000-0000-4000-8000-000000000001',paymentState:'partial',search:'PTA-1'};
 const response=await studentBalances('school-a',query);assert.equal(response.items.length,1);assert.equal(response.items[0].totalNgn,15500);assert.equal(response.summary.studentsOwing,1);
 assert.equal((await studentBalances('school-a',{...query,search:'',paymentState:'unpaid'})).items.length,0);
});
test('student-balance pagination counts students rather than invoices and clamps empty pages',async()=>{
 const bills=Array.from({length:26},(_,i)=>({id:'invoice-'+i,studentId:'student-'+i,invoiceNumber:'INV-'+i,totalNgn:100,paidNgn:0,outstandingNgn:100,student:{firstName:'Student',lastName:String(i).padStart(2,'0'),admissionNumber:String(i),class:null},items:[]}));bills.push({...bills[0],id:'extra',invoiceNumber:'EXTRA'});
 mock.method(prisma.term,'findFirst',async()=>({}));mock.method(prisma.invoice,'findMany',async()=>bills);
 const response=await studentBalances('school-a',{termId:'00000000-0000-4000-8000-000000000001',page:999});assert.equal(response.meta.page,2);assert.equal(response.meta.total,26);assert.equal(response.items.length,1);assert.equal(response.summary.studentsOwing,26);
 const first=await studentBalances('school-a',{termId:'00000000-0000-4000-8000-000000000001'});assert.equal(first.items[0].outstandingNgn,200);assert.equal(first.items.length,25);
});
test('term dates reject invalid ordering, missing boundaries and rolled-over calendar dates',()=>{
 const {assertTermDates}=require('../.test-build/features/academic/academic.service');
 const {createTermSchema}=require('../.test-build/features/academic/academic.validation');
 assert.doesNotThrow(()=>assertTermDates(null,null,false));
 assert.throws(()=>assertTermDates(null,null,true),{code:'TERM_DATES_REQUIRED'});
 assert.throws(()=>assertTermDates(new Date('2026-09-01'),null,true),{code:'TERM_DATES_REQUIRED'});
 assert.throws(()=>assertTermDates(new Date('2026-12-20'),new Date('2026-09-01'),true),{code:'INVALID_TERM_DATES'});
 assert.doesNotThrow(()=>assertTermDates(new Date('2026-09-01'),new Date('2026-12-20'),true));
 assert.equal(createTermSchema.safeParse({name:'FIRST',startDate:'2026-02-31'}).success,false);
 assert.equal(createTermSchema.parse({name:'FIRST',startDate:'2026-09-01'}).startDate.toISOString(),'2026-09-01T00:00:00.000Z');
 assert.throws(()=>attendanceWindow('term','2026-10-27',{startDate:new Date('2026-09-01'),endDate:null}),{code:'TERM_DATES_REQUIRED'});
});
const {staffImportSchema}=require('../.test-build/features/imports/staffImport');
test('staff imports default to teacher and cannot grant privileged roles through a spreadsheet',()=>{
 const rows=[{rowNumber:2,firstName:'Ada',lastName:'Obi',email:'ada@example.test'}];
 assert.equal(staffImportSchema.parse({rows}).defaultRole,'TEACHER');
 assert.equal(staffImportSchema.safeParse({rows,defaultRole:'PROPRIETOR'}).success,false);
 assert.equal(staffImportSchema.safeParse({rows,dryRun:false}).success,false);
 assert.equal(staffImportSchema.safeParse({rows:Array.from({length:101},()=>rows[0])}).success,false);
});

for (const role of ['SCHOOL_ADMIN','PRINCIPAL','EXAM_OFFICER','TEACHER']) {
 test(role+' cannot enter scores without a subject assignment',async()=>{
  mock.method(prisma.membership,'findFirst',async()=>({role}));
  mock.method(prisma.class,'findFirst',async()=>({id:'class-a',classTeacherId:'someone-else'}));
  mock.method(prisma.classSubject,'findFirst',async()=>({id:'link'}));
  mock.method(prisma.classSubjectTeacher,'findFirst',async()=>null);
  const {assertSubjectTeacher}=require('../.test-build/auth/resourceAccess');
  await assert.rejects(assertSubjectTeacher('school-a','actor','class-a','subject-a'),{statusCode:403});
 });
 test(role+' can enter scores for their assigned subject',async()=>{
  mock.method(prisma.membership,'findFirst',async()=>({role}));
  mock.method(prisma.class,'findFirst',async()=>({id:'class-a'}));
  mock.method(prisma.classSubject,'findFirst',async()=>({id:'link'}));
  mock.method(prisma.classSubjectTeacher,'findFirst',async q=>{assert.equal(q.where.userId,'actor');assert.equal(q.where.organizationId,'school-a');return {id:'assignment'};});
  const {assertSubjectTeacher}=require('../.test-build/auth/resourceAccess');
  await assertSubjectTeacher('school-a','actor','class-a','subject-a');
 });
}
test('a subject assignment alone never permits attendance entry',async()=>{
 mock.method(prisma.membership,'findFirst',async()=>({role:'TEACHER'}));
 mock.method(prisma.class,'findFirst',async q=>q.where.classTeacherId?null:{id:'class-a',classTeacherId:'other'});
 mock.method(prisma.classSubjectTeacher,'findFirst',async()=>({id:'subject-assignment'}));
 const {assertClassTeacher}=require('../.test-build/auth/resourceAccess');
 await assert.rejects(assertClassTeacher('school-a','actor','class-a'),{statusCode:403});
});
test('the assigned class teacher can enter attendance',async()=>{
 mock.method(prisma.membership,'findFirst',async()=>({role:'SCHOOL_ADMIN'}));
 mock.method(prisma.class,'findFirst',async()=>({id:'class-a',classTeacherId:'actor'}));
 const {assertClassTeacher}=require('../.test-build/auth/resourceAccess');
 await assertClassTeacher('school-a','actor','class-a');
});

test('item balances preserve explicit payments and apply older payments to remaining items',()=>{
 const {itemBalances,allocateItems}=require('../.test-build/features/fees/itemBalances');
 const bill={totalNgn:15500,paidNgn:4500,items:[{id:'a',description:'Tuition',amountNgn:12000},{id:'b',description:'PTA',amountNgn:3500}],allocations:[{amountNgn:3500,itemAllocations:[{invoiceItemId:'b',description:'PTA',amountNgn:3500}]},{amountNgn:1000}]};
 assert.deepEqual(itemBalances(bill).map(i=>[i.id,i.paidNgn,i.outstandingNgn]),[['a',1000,11000],['b',3500,0]]);
 assert.deepEqual(allocateItems(bill,2000),[{invoiceItemId:'a',description:'Tuition',amountNgn:2000}]);
 assert.throws(()=>allocateItems(bill,1,[{invoiceItemId:'b',description:'PTA',amountNgn:1}]),{code:'ITEM_BALANCE_CHANGED'});
});
test('parent checkout rejects client totals, duplicate items and missing school collection routes',()=>{
 const {parentCheckoutSchema,parentPaymentSubaccount}=require('../.test-build/features/fees/parentPayments');
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(parentCheckoutSchema.safeParse({studentId:id,idempotencyKey:id,itemIds:[id],callbackOrigin:'https://portal.test',amountNgn:1}).success,false);
 assert.equal(parentCheckoutSchema.safeParse({studentId:id,idempotencyKey:id,itemIds:[id,id],callbackOrigin:'https://portal.test'}).success,false);
 const saved=process.env.PAYSTACK_SCHOOL_SUBACCOUNTS;
 try{process.env.PAYSTACK_SCHOOL_SUBACCOUNTS='{}';assert.equal(parentPaymentSubaccount('school-a'),null);process.env.PAYSTACK_SCHOOL_SUBACCOUNTS='{"school-a":"ACCT_test123"}';assert.equal(parentPaymentSubaccount('school-a'),'ACCT_test123');assert.equal(parentPaymentSubaccount('school-b'),null);}finally{if(saved===undefined)delete process.env.PAYSTACK_SCHOOL_SUBACCOUNTS;else process.env.PAYSTACK_SCHOOL_SUBACCOUNTS=saved;}
});

test('a student-linked payment cannot be allocated to another child',async()=>{
 fakeTransactions();mock.method(prisma.payment,'findFirst',async()=>({id:'p',organizationId:'school-a',status:'SUCCESSFUL',amountNgn:100,providerPayload:{studentId:'child-a'}}));
 mock.method(prisma.paymentAllocation,'findMany',async()=>[]);mock.method(prisma.invoice,'findFirst',async()=>({id:'bill-b',studentId:'child-b',organizationId:'school-a',status:'ISSUED',outstandingNgn:100}));
 await assert.rejects(feesService.allocatePayment('school-a','p',[{invoiceId:'bill-b',amountNgn:100}],'bursar'),{code:'INVALID_INVOICES'});
});
test('student payment snapshots reject duplicate bills and invalid amounts before writes',()=>{
 const {studentPaymentSchema}=require('../.test-build/features/fees/financeWorkspace');const id='11111111-1111-4111-8111-111111111111';const input={idempotencyKey:id,studentId:id,termId:id,amountNgn:100,method:'CASH',paidAt:new Date().toISOString(),bills:[{invoiceId:id,balanceNgn:100}]};
 assert.equal(studentPaymentSchema.safeParse(input).success,true);assert.equal(studentPaymentSchema.safeParse({...input,bills:[...input.bills,...input.bills]}).success,false);assert.equal(studentPaymentSchema.safeParse({...input,amountNgn:0}).success,false);assert.equal(studentPaymentSchema.safeParse({...input,allocations:[]}).success,false);
});

test('exam dates and time ranges reject impossible dates and zero-length exams',()=>{
 const {examEntrySchema}=require('../.test-build/features/exams/exams.validation');const id='11111111-1111-4111-8111-111111111111';const entry={id,classId:id,subjectId:id,date:'2026-11-10',startTime:'09:00',endTime:'11:00'};
 assert.equal(examEntrySchema.safeParse(entry).success,true);for(const change of [{date:'2026-02-30'},{startTime:'25:00'},{endTime:'09:00'},{endTime:'08:00'}])assert.equal(examEntrySchema.safeParse({...entry,...change}).success,false);
});
test('exam clashes block overlapping classes and venues but allow shared papers and adjoining slots',()=>{
 const {validateExamClashes}=require('../.test-build/features/exams/exams.validation');const a={id:'a',classId:'class-a',subjectId:'math',date:'2026-11-10',startTime:'09:00',endTime:'11:00',venue:'Main hall',note:''};
 assert.throws(()=>validateExamClashes([a,{...a,id:'b',startTime:'10:00'}]),{code:'CLASS_EXAM_CLASH'});
 assert.throws(()=>validateExamClashes([a,{...a,id:'b',classId:'class-b',subjectId:'english',venue:'MAIN HALL'}]),{code:'VENUE_EXAM_CLASH'});
 assert.doesNotThrow(()=>validateExamClashes([a,{...a,id:'b',classId:'class-b'}]));assert.doesNotThrow(()=>validateExamClashes([a,{...a,id:'b',startTime:'11:00',endTime:'12:00'}]));
});
test('exam save signatures survive JSON object-key and row ordering changes',()=>{
 const {examEntriesSignature}=require('../.test-build/features/exams/exams.validation');const a={id:'a',classId:'class-a',subjectId:'math',date:'2026-11-10',startTime:'09:00',endTime:'11:00',venue:'',note:''};assert.equal(examEntriesSignature([a]),examEntriesSignature([{note:'',venue:'',endTime:'11:00',startTime:'09:00',date:'2026-11-10',subjectId:'math',classId:'class-a',id:'a'}]));
});

test('principal academic permissions exclude finance and cannot grant higher financial roles',()=>{
 const {permissionsForOrgRole,principalCanManageRole}=require('../.test-build/auth/rbac');
 const permissions=permissionsForOrgRole('PRINCIPAL');
 for(const permission of ['fees:read','fees:write','payments:read','payments:write','audit:read'])assert.ok(!permissions.includes(permission));
 for(const permission of ['classes:write','results:publish','exams:write','reports:export'])assert.ok(permissions.includes(permission));
 for(const role of ['PROPRIETOR','SCHOOL_ADMIN','BURSAR'])assert.equal(principalCanManageRole(role),false);
 for(const role of ['TEACHER','EXAM_OFFICER','PRINCIPAL'])assert.equal(principalCanManageRole(role),true);
});


test('own-account inputs reject identity changes and unsafe profile pictures',()=>{
 const {profileUpdateSchema,passwordChangeSchema,validProfileImage}=require('../.test-build/features/auth/profile.validation');
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
 assert.equal(validProfileImage(image),true);
 for(const input of [{},{email:'other@example.test'},{userId:'other',firstName:'Name'},{role:'PROPRIETOR'},{avatarUrl:'https://evil.test/photo'},{avatarUrl:'data:image/svg+xml;base64,PHN2Zz4='},{firstName:' '}])assert.equal(profileUpdateSchema.safeParse(input).success,false);
 assert.deepEqual(profileUpdateSchema.parse({firstName:'  Alice  ',avatarUrl:null}),{firstName:'Alice',avatarUrl:null});
 assert.equal(validProfileImage('data:image/jpeg;base64,AAAA'),false);
 assert.equal(passwordChangeSchema.safeParse({currentPassword:'old',newPassword:'short'}).success,false);
 assert.equal(passwordChangeSchema.safeParse({currentPassword:'old',newPassword:'Password123',userId:'other'}).success,false);
});
test('staff directory manager boundary excludes teaching and financial staff',()=>{
 const {isStaffManager}=require('../.test-build/middlewares/requireStaffManager');
 for(const role of ['PROPRIETOR','PRINCIPAL','SCHOOL_ADMIN'])assert.equal(isStaffManager(role),true);
 for(const role of ['TEACHER','EXAM_OFFICER','BURSAR','STAFF','PARENT',undefined])assert.equal(isStaffManager(role),false);
});


test('membership roles combine permissions without inventing finance access',()=>{
 const {membershipRoles,primaryRole,permissionsForMembership}=require('../.test-build/auth/rbac');
 const teacherExam={role:'TEACHER',roles:['TEACHER','EXAM_OFFICER']};const permissions=permissionsForMembership(teacherExam);
 assert.ok(permissions.includes('attendance:write'));assert.ok(permissions.includes('results:write'));assert.ok(permissions.includes('exams:write'));assert.ok(!permissions.includes('payments:write'));assert.equal(new Set(permissions).size,permissions.length);
 assert.equal(primaryRole(membershipRoles(teacherExam)),'EXAM_OFFICER');assert.ok(!permissionsForMembership({role:'PRINCIPAL',roles:['PRINCIPAL','TEACHER']}).includes('fees:read'));
});
test('role-set validation rejects empty, duplicate, unknown and parent/staff combinations',()=>{
 const {updateMembershipSchema}=require('../.test-build/features/memberships/memberships.validation');
 for(const input of [{roles:[]},{roles:['TEACHER','TEACHER']},{roles:['TEACHER','PARENT']},{roles:['UNKNOWN']},{roles:['TEACHER'],role:'BURSAR'},{permissions:['payments:write']},{}])assert.equal(updateMembershipSchema.safeParse(input).success,false);
 assert.equal(updateMembershipSchema.safeParse({roles:['TEACHER','EXAM_OFFICER']}).success,true);
});
test('financial plus teaching roles retain assigned-class academic read limits',()=>{
 const {teachingClassFilter}=require('../.test-build/auth/resourceAccess');const auth={schoolId:'a',userId:'teacher',orgRole:'BURSAR',orgRoles:['BURSAR','TEACHER']};
 assert.equal(teachingClassFilter(auth).organizationId,'a');assert.equal(teachingClassFilter({...auth,orgRole:'EXAM_OFFICER',orgRoles:['EXAM_OFFICER','TEACHER']}).organizationId,undefined);assert.equal(teachingClassFilter({...auth,orgRole:'EXAM_OFFICER',orgRoles:['EXAM_OFFICER','TEACHER']},'attendance').organizationId,'a');
});


test('daily timetable formats reserve breaks and reject invalid days, repeated papers and midnight overflow',()=>{
 const {timetableFormatSchema,validateFormattedEntries,formatSignature}=require('../.test-build/features/exams/exams.validation');
 const format=timetableFormatSchema.parse({startDate:'2026-11-10',startTime:'08:00',papersPerDay:3,paperMinutes:120,breakAfter:1,breakMinutes:30,weekdays:[1,2,3,4,5]});
 const paper={id:'x',classId:'class',subjectId:'math',date:'2026-11-10',startTime:'10:30',endTime:'12:30',venue:'',note:''};validateFormattedEntries([paper],format);
 assert.throws(()=>validateFormattedEntries([{...paper,startTime:'10:00',endTime:'10:30'}],format),{code:'TIMETABLE_FORMAT_MISMATCH'});
 assert.throws(()=>validateFormattedEntries([{...paper,date:'2026-11-15'}],format),{code:'TIMETABLE_FORMAT_MISMATCH'});
 assert.throws(()=>validateFormattedEntries([paper,{...paper,id:'y',date:'2026-11-11'}],format),{code:'DUPLICATE_CLASS_PAPER'});
 assert.equal(timetableFormatSchema.safeParse({...format,startTime:'20:00'}).success,false);assert.equal(timetableFormatSchema.safeParse({...format,weekdays:[]}).success,false);
 assert.equal(formatSignature(format),formatSignature({...format,weekdays:[5,4,3,2,1]}));
});
