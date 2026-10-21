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
    'create', 'createMany', 'update', 'updateMany', 'upsert', 'count', 'aggregate', 'delete', 'deleteMany']
    .map(method => [method, unexpectedQuery]));
}
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
