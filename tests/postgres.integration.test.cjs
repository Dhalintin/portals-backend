const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assertTestDatabaseUrl } = require('../scripts/test-database.cjs');
const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== url) {
  throw new Error('Integration tests must run through the private PostgreSQL test runner.');
}
const { prisma } = require('../.test-build/lib/prisma');
const { app } = require('../.test-build/app');
const { authSessions } = require('../.test-build/features/auth/auth.sessions');
const { authService } = require('../.test-build/features/auth/auth.service');
const { feesService } = require('../.test-build/features/fees/fees.service');
const { attendanceService } = require('../.test-build/features/attendance/attendance.service');
const { studentsService } = require('../.test-build/features/students/students.service');
const { academicService } = require('../.test-build/features/academic/academic.service');
const paystack = require('../.test-build/lib/paystack');
const { verifyRefreshToken, verifyAccessToken } = require('../.test-build/auth/jwt');
const { sha256 } = require('../.test-build/lib/token');
const { seed, fixtures: { a, b }, DEFAULT_TEST_PASSWORD } = require('../prisma/seeds/index.cjs');
const check = (name, work) => test(name, { timeout: 30_000 }, work);
let server, base;

before(async () => {
  await seed(prisma);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
afterEach(() => mock.restoreAll());
after(async () => {
  try { if (server) await new Promise(resolve => server.close(resolve)); }
  finally { await prisma.$disconnect(); }
});

async function tokens(userId, schoolId) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return authSessions.create(userId, schoolId, user.authVersion);
}
async function request(method, route, accessToken, body) {
  const response = await fetch(base + route, { method, headers: {
    'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
function successful(outcomes) { return outcomes.filter(result => result.status === 'fulfilled'); }
check('teacher endpoints use session context, parsed queries and current staff permissions', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const teacher = (await tokens(a.teacherId, a.id)).accessToken;
  const parent = (await tokens(a.parentUserId, a.id)).accessToken;
  const list = await request('GET', '/teachers?page=1&pageSize=1', owner);
  assert.equal(list.status, 200); assert.equal(list.body.data.meta.pageSize, 1);
  assert.equal((await request('GET', `/teachers/${a.teacherId}`, owner)).status, 200);
  assert.equal((await request('GET', `/teachers/${b.teacherId}`, owner)).status, 404);
  assert.equal((await request('GET', '/teachers/me/assignments', teacher)).status, 200);
  assert.equal((await request('GET', '/teachers', teacher)).status, 403);
  assert.equal((await request('GET', '/teachers/me/assignments', parent)).status, 403);
  assert.equal((await request('PATCH', `/teachers/${a.teacherId}`, owner, { firstName: 'Changed' })).status, 400);
});

check('teacher invitation is pending and rejects administrator-set credentials', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const body = { email: 'teacher.pending@example.test', firstName: 'Pending', lastName: 'Teacher' };
  assert.equal((await request('POST', '/teachers/invite', owner, { ...body, temporaryPassword: DEFAULT_TEST_PASSWORD })).status, 400);
  const result = await request('POST', '/teachers/invite', owner, body);
  assert.equal(result.status, 201); assert.equal(result.body.data.invitation.status, 'PENDING');
  assert.equal(await prisma.user.findUnique({ where: { email: body.email } }), null);
  assert.equal(await prisma.schoolInvitation.count({ where: { email: body.email, organizationId: a.id } }), 1);
});

check('credentialed CORS reflects configured origins only and leaves server clients usable', async () => {
  const origin = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')[0].trim();
  const allowed = await fetch(base + '/teachers', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  const denied = await fetch(base + '/teachers', { headers: { Origin: 'https://untrusted.example.test' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await request('GET', '/teachers')).status, 401);
});
async function invoice(number, totalNgn, fixture = a) {
  return prisma.invoice.create({ data: { organizationId: fixture.id, studentId: fixture.studentId,
    invoiceNumber: number, totalNgn, paidNgn: 0, outstandingNgn: totalNgn, status: 'ISSUED' } });
}
async function payment(amountNgn) {
  return feesService.createManualPayment(a.id, { idempotencyKey: crypto.randomUUID(), amountNgn, method: 'CASH', source: 'MANUAL' }, a.bursarId);
}

check('deterministic seed is repeatable and admission numbers remain unique per school', async () => {
  const before = { students: await prisma.student.count(), users: await prisma.user.count(), results: await prisma.result.count() };
  await seed(prisma);
  assert.deepEqual({ students: await prisma.student.count(), users: await prisma.user.count(), results: await prisma.result.count() }, before);
  assert.equal(before.students, 6); assert.equal(before.users, 8);
  assert.equal(await prisma.student.count({ where: { admissionNumber: 'S001' } }), 2);
});

check('real login persists a session and tenant-scoped APIs reject another school IDs', async () => {
  const login = await request('POST', '/auth/login', null, {
    email: 'owner.a@example.test', password: DEFAULT_TEST_PASSWORD, schoolSlug: a.slug,
  });
  assert.equal(login.status, 200);
  const token = login.body.data.accessToken;
  const claims = verifyAccessToken(token);
  const session = await prisma.authSession.findUniqueOrThrow({ where: { id: claims.sid } });
  assert.equal(session.schoolId, a.id);
  assert.equal(session.refreshTokenHash, sha256(login.body.data.refreshToken));
  assert.equal((await request('GET', `/students/${b.studentId}`, token)).status, 404);
  assert.equal((await request('GET', `/results/${b.publishedResultId}`, token)).status, 404);
  assert.equal((await request('GET', `/fees/invoices/${b.invoiceId}`, token)).status, 404);
});

check('parent HTTP reads return only linked published child records', async () => {
  const token = (await tokens(a.parentUserId, a.id)).accessToken;
  const results = await request('GET', '/results/parent/me', token);
  assert.equal(results.status, 200);
  assert.deepEqual(results.body.data.map(row => row.id), [a.publishedResultId]);
  const fees = await request('GET', '/fees/parent/me', token);
  assert.equal(fees.status, 200); assert.deepEqual(fees.body.data.invoices.map(row => row.studentId), [a.studentId]);
  assert.equal((await request('GET', '/results', token)).status, 403);
  assert.equal((await request('GET', '/fees/invoices', token)).status, 403);
  assert.equal((await request('GET', `/results/parent/report-cards/${a.ownDraftResultId}`, token)).status, 404);
  assert.equal((await request('GET', `/results/parent/report-cards/${b.publishedResultId}`, token)).status, 404);
  assert.equal((await request('GET', `/attendance/parent/students/${a.otherStudentId}`, token)).status, 404);
});

check('teacher HTTP reads and writes respect assigned classes and publishing authority', async () => {
  const token = (await tokens(a.teacherId, a.id)).accessToken;
  const students = await request('GET', '/students', token);
  assert.equal(students.status, 200);
  assert.deepEqual(students.body.data.items.map(row => row.id).sort(), [a.studentId, a.otherStudentId].sort());
  assert.equal((await request('GET', `/students/${a.unassignedStudentId}`, token)).status, 404);
  assert.equal((await request('POST', '/results/scores', token, {
    resultId: a.unassignedResultId, scores: [{ subjectId: a.subjectId, exam: 50 }],
  })).status, 403);
  assert.equal((await request('PATCH', `/results/${a.draftResultId}/status`, token, { status: 'APPROVED' })).status, 403);
});

check('attendance sync cannot modify a foreign school record', async () => {
  const original = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: b.attendanceId } });
  await assert.rejects(attendanceService.offlineSync(a.id, a.teacherId, { records: [
    { studentId: b.studentId, classId: a.classId, date: '2026-10-13', status: 'ABSENT', clientKey: 'foreign-record-1' },
  ] }), { code: 'INVALID_STUDENT' });
  const current = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: b.attendanceId } });
  assert.equal(current.status, original.status); assert.deepEqual(current.updatedAt, original.updatedAt);
});

check('simultaneous offline retries produce one attendance row', async () => {
  const data = { records: [{ studentId: a.studentId, classId: a.classId,
    date: '2026-10-14', status: 'PRESENT', clientKey: 'offline-replay-001' }] };
  await Promise.all([attendanceService.offlineSync(a.id, a.teacherId, data), attendanceService.offlineSync(a.id, a.teacherId, data)]);
  assert.equal(await prisma.attendanceRecord.count({ where: { organizationId: a.id, clientKey: 'offline-replay-001' } }), 1);
});

check('the database enforces unique provider references and school/client sync keys', async () => {
  await prisma.payment.create({ data: { organizationId: a.id, amountNgn: 1, providerReference: 'IT-UNIQUE-REFERENCE' } });
  await assert.rejects(prisma.payment.create({ data: { organizationId: b.id, amountNgn: 1,
    providerReference: 'IT-UNIQUE-REFERENCE' } }), { code: 'P2002' });
  await prisma.attendanceRecord.create({ data: { organizationId: a.id, studentId: a.studentId,
    classId: a.classId, date: new Date('2026-11-01'), status: 'PRESENT', clientKey: 'database-unique-key' } });
  await assert.rejects(prisma.attendanceRecord.create({ data: { organizationId: a.id, studentId: a.studentId,
    classId: a.classId, date: new Date('2026-11-02'), status: 'PRESENT', clientKey: 'database-unique-key' } }), { code: 'P2002' });
});

check('simultaneous allocations cannot spend the same payment twice', async () => {
  const bill = await invoice('IT-PAYMENT-CAP', 200); const cash = await payment(100);
  const outcomes = await Promise.allSettled([
    feesService.allocatePayment(a.id, cash.id, [{ invoiceId: bill.id, amountNgn: 60 }], a.bursarId),
    feesService.allocatePayment(a.id, cash.id, [{ invoiceId: bill.id, amountNgn: 60 }], a.bursarId),
  ]);
  assert.equal(successful(outcomes).length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'OVER_ALLOCATION');
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).paidNgn, 60);
  assert.equal(await prisma.receipt.count({ where: { paymentId: cash.id } }), 1);
});

check('simultaneous payments cannot exceed an invoice outstanding balance', async () => {
  const bill = await invoice('IT-INVOICE-CAP', 100);
  const [first, second] = await Promise.all([payment(100), payment(100)]);
  const outcomes = await Promise.allSettled([first, second].map(cash =>
    feesService.allocatePayment(a.id, cash.id, [{ invoiceId: bill.id, amountNgn: 80 }], a.bursarId)));
  assert.equal(successful(outcomes).length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'OVER_OUTSTANDING');
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } });
  assert.equal(current.paidNgn, 80); assert.equal(current.outstandingNgn, 20);
});

check('a failed multi-invoice allocation rolls back payment, allocations, balances and receipts', async () => {
  const bill = await invoice('IT-ROLLBACK', 100);
  const payments = await prisma.payment.count(); const receipts = await prisma.receipt.count();
  await assert.rejects(feesService.createManualPayment(a.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: bill.id, amountNgn: 50 }, { invoiceId: b.invoiceId, amountNgn: 50 }],
  }, a.bursarId), { code: 'INVOICE_NOT_FOUND' });
  assert.equal(await prisma.payment.count(), payments); assert.equal(await prisma.receipt.count(), receipts);
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } });
  assert.equal(current.paidNgn, 0); assert.equal(current.outstandingNgn, 100);
  assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: bill.id } }), 0);
});

check('simultaneous successful webhook replays credit an invoice and issue a receipt once', async () => {
  const bill = await invoice('IT-WEBHOOK', 100);
  const pending = await prisma.payment.create({ data: { organizationId: a.id, amountNgn: 100, status: 'PENDING',
    method: 'ONLINE', source: 'PAYSTACK', providerReference: 'IT-WEBHOOK-REFERENCE', providerPayload: { invoiceIds: [bill.id] } } });
  // Only the external provider response is mocked; all persistence/locking is PostgreSQL.
  mock.method(paystack, 'verifyTransaction', async reference => ({ status: 'success', amount: 10000,
    currency: 'NGN', reference, paid_at: '2026-10-13T12:00:00Z' }));
  const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: pending.providerReference } }));
  const signature = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
  await Promise.all(Array.from({ length: 3 }, () => feesService.handlePaystackWebhook(raw, signature)));
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: pending.id } }), 1);
  assert.equal(await prisma.receipt.count({ where: { paymentId: pending.id } }), 1);
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } });
  assert.equal(current.paidNgn, 100); assert.equal(current.status, 'PAID');
});

check('manual provider verification recovers a pending payment without a webhook body', async () => {
  const bill = await invoice('IT-RECOVERY', 100);
  const pending = await prisma.payment.create({ data: { organizationId: a.id, amountNgn: 100,
    method: 'ONLINE', source: 'PAYSTACK', providerReference: 'IT-RECOVERY-REFERENCE', providerPayload: { invoiceIds: [bill.id] } } });
  mock.method(paystack, 'verifyTransaction', async reference => ({ status: 'success', amount: 10000, currency: 'NGN', reference }));
  await feesService.verifyAndFinalize(a.id, pending.providerReference, a.bursarId);
  assert.equal(await prisma.receipt.count({ where: { paymentId: pending.id } }), 1);
});

check('concurrent invoice generation produces distinct sequential invoice numbers', async () => {
  const batches = await Promise.all([1, 2].map(number => feesService.generateInvoices(a.id,
    { idempotencyKey: `distinct-generation-${number}`, feeStructureId: a.structureId, studentIds: [a.studentId, a.otherStudentId] }, a.bursarId)));
  const numbers = batches.flatMap(batch => batch.invoices.map(row => row.invoiceNumber));
  assert.equal(numbers.length, 4); assert.equal(new Set(numbers).size, 4);
});

check('concurrent student creation cannot exceed the subscription cap', async () => {
  const active = await prisma.student.count({ where: { organizationId: a.id, isActive: true } });
  await prisma.subscription.update({ where: { organizationId: a.id }, data: { studentCap: active + 1 } });
  try {
    const outcomes = await Promise.allSettled(['A', 'B'].map(label => studentsService.create(a.id, a.ownerId,
      { admissionNumber: `IT-CAP-${label}`, firstName: 'Capacity', lastName: label })));
    assert.equal(successful(outcomes).length, 1);
    assert.equal(await prisma.student.count({ where: { organizationId: a.id, isActive: true } }), active + 1);
  } finally { await prisma.subscription.update({ where: { organizationId: a.id }, data: { studentCap: 100 } }); }
});

check('concurrent refreshes rotate once and commit reuse revocation in PostgreSQL', async () => {
  const original = await tokens(a.teacherId, a.id);
  const outcomes = await Promise.allSettled([authSessions.refresh(original.refreshToken), authSessions.refresh(original.refreshToken)]);
  assert.equal(successful(outcomes).length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'REFRESH_TOKEN_REUSED');
  const session = await prisma.authSession.findUniqueOrThrow({ where: { id: verifyRefreshToken(original.refreshToken).sid } });
  assert.ok(session.revokedAt);
  assert.equal((await request('GET', '/auth/me', successful(outcomes)[0].value.accessToken)).status, 401);
});

check('HTTP logout revokes a persisted session and its token pair', async () => {
  const original = await tokens(a.ownerId, a.id);
  assert.equal((await request('POST', '/auth/logout', original.accessToken, {})).status, 200);
  assert.equal((await request('GET', '/auth/me', original.accessToken)).status, 401);
  await assert.rejects(authSessions.refresh(original.refreshToken), { code: 'SESSION_EXPIRED' });
});

check('simultaneous password resets consume once and revoke sessions across schools', async () => {
  await prisma.membership.create({ data: { userId: a.teacherId, organizationId: b.id, role: 'TEACHER' } });
  const original = await tokens(a.teacherId, a.id); const second = await tokens(a.teacherId, b.id);
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: a.teacherId } });
  const resetTokens = ['IT-reset-a-', 'IT-reset-b-'].map(prefix => prefix + crypto.randomBytes(20).toString('hex'));
  for (const token of resetTokens) await prisma.passwordResetToken.create({ data: {
    userId: a.teacherId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000),
  } });
  const outcomes = await Promise.allSettled(resetTokens.map(token => authService.resetPassword(token, 'IntegrationNewPassword123!')));
  assert.equal(successful(outcomes).length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'INVALID_TOKEN');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.teacherId } })).authVersion, previous.authVersion + 1);
  assert.equal(await prisma.authSession.count({ where: { userId: a.teacherId, revokedAt: null } }), 0);
  assert.equal((await request('GET', '/auth/me', original.accessToken)).status, 401);
  await assert.rejects(authSessions.refresh(second.refreshToken), { code: 'SESSION_EXPIRED' });
});

check('calendar changes serialize to one current session per school', async () => {
  const sessions = await Promise.all(['2027/2028', '2028/2029'].map(name => academicService.createSession(a.id, { name, isCurrent: true })));
  assert.equal(sessions.length, 2);
  assert.equal(await prisma.academicSession.count({ where: { organizationId: a.id, isCurrent: true } }), 1);
  assert.equal(await prisma.academicSession.count({ where: { organizationId: b.id, isCurrent: true } }), 1);
  assert.equal((await prisma.term.findUniqueOrThrow({ where: { id: b.termId } })).isCurrent, true);
});

check('creating/updating a current term switches the current session consistently', async () => {
  const session = await academicService.createSession(a.id, { name: '2029/2030', isCurrent: false });
  const term = await academicService.createTerm(a.id, session.id, { name: 'FIRST', isCurrent: true, startDate:new Date('2029-09-01'),endDate:new Date('2029-12-20') });
  let current = await academicService.getCurrent(a.id);
  assert.equal(current.session.id, session.id); assert.equal(current.term.id, term.id);
  await academicService.updateTerm(a.id, a.sessionId, a.secondTermId, { isCurrent: true,startDate:new Date('2027-01-11'),endDate:new Date('2027-04-09') });
  current = await academicService.getCurrent(a.id);
  assert.equal(current.session.id, a.sessionId); assert.equal(current.term.id, a.secondTermId);
  assert.equal(await prisma.term.count({ where: { session: { organizationId: a.id }, isCurrent: true } }), 1);
});

check('concurrent term selection leaves exactly one current term in the current session', async () => {
  await prisma.term.update({where:{id:a.termId},data:{startDate:new Date('2026-09-01'),endDate:new Date('2026-12-18')}});
  const session = await academicService.createSession(a.id, { name: '2030/2031', isCurrent: false });
  const term = await academicService.createTerm(a.id, session.id, { name: 'FIRST', isCurrent: false,startDate:new Date('2030-09-01'),endDate:new Date('2030-12-20') });
  await Promise.all([
    academicService.setCurrentTerm(a.id, a.sessionId, a.termId),
    academicService.setCurrentTerm(a.id, session.id, term.id),
  ]);
  const current = await academicService.getCurrent(a.id);
  assert.equal(current.term.sessionId, current.session.id);
  assert.equal(await prisma.term.count({ where: { session: { organizationId: a.id }, isCurrent: true } }), 1);
});

check('switching to a session without a selected term clears stale current terms', async () => {
  const session = await academicService.createSession(a.id, { name: '2031/2032', isCurrent: false });
  await academicService.setCurrentSession(a.id, session.id);
  const current = await academicService.getCurrent(a.id);
  assert.equal(current.session.id, session.id); assert.equal(current.term, null);
  assert.equal(await prisma.term.count({ where: { session: { organizationId: a.id }, isCurrent: true } }), 0);
});

check('re-seeding preserves existing invoice balances and allocations', async () => {
  const cash = await feesService.createManualPayment(a.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: a.invoiceId, amountNgn: 100 }],
  }, a.bursarId);
  const original = await prisma.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
  await seed(prisma);
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
  assert.equal(current.paidNgn, original.paidNgn); assert.equal(current.outstandingNgn, original.outstandingNgn);
  assert.equal(current.status, original.status);
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: cash.id } }), 1);
});

check('concurrent invoice retries create one batch, normalize recipients and reject changed payloads', async () => {
  const input = { idempotencyKey: 'retry-batch-test-0001', feeStructureId: b.structureId,
    studentIds: [b.studentId, b.otherStudentId] };
  const batches = await Promise.all([feesService.generateInvoices(b.id, input, b.bursarId),
    feesService.generateInvoices(b.id, { ...input, studentIds: [b.otherStudentId, b.studentId, b.studentId] }, b.bursarId)]);
  assert.equal(batches[0].batchId, batches[1].batchId);
  assert.equal(batches.filter(batch => batch.replayed).length, 1);
  assert.equal(await prisma.invoice.count({ where: { batchId: batches[0].batchId } }), 2);
  await assert.rejects(feesService.generateInvoices(b.id, { ...input, studentIds: [b.studentId] }, b.bursarId),
    { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(await prisma.auditLog.count({ where: { entityId: batches[0].batchId, action: 'INVOICE_CREATED' } }), 1);
  const before = batches[0].invoices[0].totalNgn;
  const category = await prisma.feeCategory.findFirstOrThrow({ where: { organizationId: b.id } });
  await feesService.updateStructure(b.id, b.structureId, { items: [{ feeCategoryId: category.id, amountNgn: before + 100 }] }, b.bursarId);
  try {
    const replay = await feesService.generateInvoices(b.id, input, b.bursarId);
    assert.equal(replay.invoices[0].totalNgn, before);
    const fresh = await feesService.generateInvoices(b.id, { ...input, idempotencyKey: 'retry-batch-test-0002' }, b.bursarId);
    assert.equal(fresh.invoices[0].totalNgn, before + 100);
    await feesService.updateStructure(b.id, b.structureId, { isActive: false }, b.bursarId);
    assert.equal((await feesService.generateInvoices(b.id, input, b.bursarId)).replayed, true);
    await assert.rejects(feesService.generateInvoices(b.id, { ...input, idempotencyKey: 'retry-batch-test-0003' }, b.bursarId),
      { code: 'INACTIVE_STRUCTURE' });
  } finally { await feesService.updateStructure(b.id, b.structureId,
    { isActive: true, items: [{ feeCategoryId: category.id, amountNgn: before }] }, b.bursarId); }
});

check('structure edits are scoped, validated and do not change issued invoice snapshots', async () => {
  const token = await tokens(b.bursarId, b.id);
  const category = await prisma.feeCategory.findFirstOrThrow({ where: { organizationId: a.id } });
  assert.equal((await request('PATCH', `/fees/structures/${a.structureId}`, token.accessToken, { name: 'foreign' })).status, 404);
  const previous = await feesService.getStructure(b.id, b.structureId);
  await assert.rejects(feesService.updateStructure(b.id, b.structureId,
    { items: [{ feeCategoryId: category.id, amountNgn: 900 }] }, b.bursarId), { code: 'INVALID_CATEGORIES' });
  assert.deepEqual((await feesService.getStructure(b.id, b.structureId)).items, previous.items);
  assert.equal((await request('PATCH', `/fees/structures/${b.structureId}`, token.accessToken, {})).status, 422);
  assert.equal((await request('PATCH', `/fees/structures/${b.structureId}`, token.accessToken, { name: 'Revised tuition' })).status, 200);
});

check('unpaid cancellation is audited, repeat-safe, scoped and blocks later allocations', async () => {
  const row = await invoice('IT-CANCEL-0001', 500, b);
  const token = await tokens(b.bursarId, b.id);
  assert.equal((await request('POST', `/fees/invoices/${row.id}/cancel`, token.accessToken, { reason: 'Incorrect invoice' })).status, 200);
  const cancelled = await feesService.cancelInvoice(b.id, row.id, 'Incorrect invoice', b.bursarId);
  assert.equal(cancelled.status, 'CANCELLED'); assert.equal(cancelled.outstandingNgn, 0);
  assert.equal(cancelled.totalNgn, 500);
  assert.equal(await prisma.auditLog.count({ where: { entityId: row.id } }), 1);
  await assert.rejects(feesService.cancelInvoice(a.id, row.id, 'Foreign invoice', a.bursarId), { code: 'NOT_FOUND' });
  await assert.rejects(feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: row.id, amountNgn: 100 }] }, b.bursarId), { code: 'CANCELLED_INVOICE' });
  const paid = await invoice('IT-CANCEL-0002', 500, b);
  await feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: paid.id, amountNgn: 100 }] }, b.bursarId);
  await assert.rejects(feesService.cancelInvoice(b.id, paid.id, 'Cannot erase payment history', b.bursarId), { code: 'INVOICE_HAS_PAYMENTS' });
});

check('onboarding requires a working parent connection and provides a scoped checklist', async () => {
  const { schoolsService } = require('../.test-build/features/schools/schools.service');
  const owner = await tokens(b.ownerId, b.id);
  const parent = await tokens(b.parentUserId, b.id);
  const initial = await request('GET', '/schools/onboarding', owner.accessToken);
  assert.equal(initial.status, 200);
  assert.equal((await request('GET', '/schools/onboarding', parent.accessToken)).status, 403);
  await prisma.organization.update({ where: { id: b.id }, data: { onBoarded: false } });
  await prisma.parent.update({ where: { id: b.parentId }, data: { isActive: false } });
  try {
    const checklist = await schoolsService.getOnboarding(b.id);
    assert.equal(checklist.readyForCompletion, false);
    assert.equal(checklist.checks.find(check => check.key === 'parentLogin').complete, false);
    await assert.rejects(schoolsService.completeOnboarding(b.id, b.ownerId), { code: 'ONBOARDING_INCOMPLETE' });
    assert.equal((await prisma.organization.findUniqueOrThrow({ where: { id: b.id } })).onBoarded, false);
  } finally { await prisma.parent.update({ where: { id: b.parentId }, data: { isActive: true } }); }
  assert.equal((await schoolsService.getOnboarding(b.id)).readyForCompletion, true);
  assert.equal((await schoolsService.completeOnboarding(b.id, b.ownerId)).onBoarded, true);
});

check('invoice HTTP retries require a key and reject an empty explicit recipient list', async () => {
  const token = await tokens(b.bursarId, b.id);
  const body = { feeStructureId: b.structureId, studentIds: [b.studentId], idempotencyKey: 'http-invoice-retry-0001' };
  const first = await request('POST', '/fees/invoices/generate', token.accessToken, body);
  const retry = await request('POST', '/fees/invoices/generate', token.accessToken, body);
  assert.equal(first.status, 201); assert.equal(retry.status, 200);
  assert.equal(first.body.data.batchId, retry.body.data.batchId);
  assert.equal((await request('POST', '/fees/invoices/generate', token.accessToken,
    { feeStructureId: b.structureId, studentIds: [b.studentId] })).status, 422);
  assert.equal((await request('POST', '/fees/invoices/generate', token.accessToken, { ...body, studentIds: [] })).status, 422);
  assert.equal((await request('POST', '/fees/invoices/generate', token.accessToken,
    { ...body, dueDate: '2026-12-01T00:00:00Z' })).status, 409);
  const other = await feesService.generateInvoices(a.id, { ...body, feeStructureId: a.structureId, studentIds: [a.studentId] }, a.bursarId);
  assert.notEqual(other.batchId, first.body.data.batchId);
});

check('payment and cancellation racing on one invoice cannot both commit', async () => {
  const row = await invoice('IT-CANCEL-RACE-0001', 500, b);
  const outcomes = await Promise.allSettled([
    feesService.cancelInvoice(b.id, row.id, 'Invoice cancelled by bursar', b.bursarId),
    feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 500, method: 'CASH', source: 'MANUAL',
      allocations: [{ invoiceId: row.id, amountNgn: 500 }] }, b.bursarId),
  ]);
  assert.equal(successful(outcomes).length, 1);
  const current = await prisma.invoice.findUniqueOrThrow({ where: { id: row.id }, include: { allocations: true } });
  if (current.status === 'CANCELLED') { assert.equal(current.paidNgn, 0); assert.equal(current.allocations.length, 0); }
  else { assert.equal(current.status, 'PAID'); assert.equal(current.paidNgn, 500); assert.equal(current.allocations.length, 1); }
});

check('manual payment HTTP retries create one payment, allocation, receipt and audit', async () => {
  const bill = await invoice('IT-PAY-RETRY-0001', 900, b);
  const token = await tokens(b.bursarId, b.id);
  const body = { idempotencyKey: crypto.randomUUID(), amountNgn: 400, method: 'CASH',
    allocations: [{ invoiceId: bill.id, amountNgn: 400 }] };
  const responses = await Promise.all([request('POST', '/fees/payments', token.accessToken, body),
    request('POST', '/fees/payments', token.accessToken, body)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
  assert.equal(responses[0].body.data.id, responses[1].body.data.id);
  const paymentId = responses[0].body.data.id;
  assert.equal(await prisma.paymentAllocation.count({ where: { paymentId } }), 1);
  assert.equal(await prisma.receipt.count({ where: { paymentId } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: paymentId } }), 1);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).outstandingNgn, 500);
  assert.equal((await request('POST', '/fees/payments', token.accessToken, { ...body, amountNgn: 401 })).status, 409);
  assert.equal((await request('POST', '/fees/payments', token.accessToken, { amountNgn: 10 })).status, 422);
  assert.equal((await request('POST', '/fees/payments', token.accessToken, { ...body, method: 'ONLINE' })).status, 422);
  assert.equal((await request('POST', '/fees/payments', token.accessToken, { ...body, amountNgn: 2147483648 })).status, 422);
  const other = await feesService.createManualPayment(a.id, { idempotencyKey: body.idempotencyKey,
    amountNgn: 10, method: 'CASH', source: 'MANUAL' }, a.bursarId);
  assert.notEqual(other.id, paymentId);
});

check('failed manual allocation leaves its key available for a corrected retry', async () => {
  const idempotencyKey = crypto.randomUUID();
  await assert.rejects(feesService.createManualPayment(b.id, { idempotencyKey, amountNgn: 100,
    method: 'CASH', source: 'MANUAL', allocations: [{ invoiceId: a.invoiceId, amountNgn: 100 }] }, b.bursarId), { code: 'INVOICE_NOT_FOUND' });
  assert.equal(await prisma.payment.count({ where: { organizationId: b.id, idempotencyKey } }), 0);
  const row = await feesService.createManualPayment(b.id, { idempotencyKey, amountNgn: 100, method: 'CASH', source: 'MANUAL' }, b.bursarId);
  assert.equal(row.replayed, false);
});

check('invoice corrections validate school categories, protect history and record before/after', async () => {
  const row = await invoice('IT-CORRECT-0001', 500, b);
  const category = await prisma.feeCategory.findFirstOrThrow({ where: { organizationId: b.id } });
  const foreign = await prisma.feeCategory.findFirstOrThrow({ where: { organizationId: a.id } });
  const token = await tokens(b.bursarId, b.id);
  const body = { reason: 'Correct tuition amount', items: [{ feeCategoryId: category.id, amountNgn: 700 }], dueDate: '2026-12-01T00:00:00Z' };
  await assert.rejects(feesService.correctInvoice(b.id, row.id, { ...body, items: [{ feeCategoryId: foreign.id, amountNgn: 700 }] }, b.bursarId), { code: 'INVALID_CATEGORIES' });
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: row.id } })).totalNgn, 500);
  const response = await request('PATCH', `/fees/invoices/${row.id}`, token.accessToken, body);
  assert.equal(response.status, 200); assert.equal(response.body.data.totalNgn, 700); assert.equal(response.body.data.outstandingNgn, 700);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: row.id } });
  assert.equal(audit.metadata.before.totalNgn, 500); assert.equal(audit.metadata.after.totalNgn, 700);
  assert.equal(audit.metadata.reason, body.reason);
  const cleared = await feesService.correctInvoice(b.id, row.id, { reason: 'Remove due date', dueDate: null }, b.bursarId);
  assert.equal(cleared.dueDate, null); assert.equal(cleared.items.length, 1);
  await assert.rejects(feesService.correctInvoice(a.id, row.id, body, a.bursarId), { code: 'NOT_FOUND' });
  await feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 10, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: row.id, amountNgn: 10 }] }, b.bursarId);
  await assert.rejects(feesService.correctInvoice(b.id, row.id, body, b.bursarId), { code: 'INVOICE_LOCKED' });
  assert.equal((await request('PATCH', `/fees/invoices/${row.id}`, token.accessToken, { reason: 'No actual change' })).status, 422);
});

check('manual reversal preserves payment history, voids receipts and restores invoice balances once', async () => {
  const first = await invoice('IT-REVERSE-0001', 500, b);
  const second = await invoice('IT-REVERSE-0002', 600, b);
  const body = { idempotencyKey: crypto.randomUUID(), amountNgn: 700, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: first.id, amountNgn: 300 }, { invoiceId: second.id, amountNgn: 400 }] };
  const payment = await feesService.createManualPayment(b.id, body, b.bursarId);
  const unaffected = await feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 50, method: 'CASH', source: 'MANUAL',
    allocations: [{ invoiceId: first.id, amountNgn: 50 }] }, b.bursarId);
  const before = await feesService.bursarSummary(b.id);
  const results = await Promise.all([1, 2].map(() => feesService.reverseManualPayment(b.id, payment.id, 'Duplicate cash entry', b.bursarId)));
  assert.equal(results[0].status, 'REVERSED'); assert.equal(results[1].status, 'REVERSED');
  assert.equal(results[0].amountNgn, 700);
  const current = await feesService.getPayment(b.id, payment.id);
  assert.equal(current.allocations.length, 2); assert.ok(current.allocations.every(row => row.reversedAt));
  assert.equal(current.receipts.length, 2); assert.ok(current.receipts.every(row => row.voidedAt));
  const token = await tokens(b.bursarId, b.id);
  const replay = await request('POST', `/fees/payments/${payment.id}/reverse`, token.accessToken, { reason: 'Duplicate cash entry' });
  assert.equal(replay.status, 200); assert.equal(replay.body.data.status, 'REVERSED');
  const receipt = await request('GET', `/fees/receipts/${current.receipts[0].id}`, token.accessToken);
  assert.equal(receipt.status, 200); assert.ok(receipt.body.data.voidedAt);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: first.id } })).paidNgn, 50);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: first.id } })).outstandingNgn, 450);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: second.id } })).outstandingNgn, 600);
  assert.equal((await feesService.getPayment(b.id, unaffected.id)).status, 'SUCCESSFUL');
  assert.equal(await prisma.auditLog.count({ where: { entityId: payment.id } }), 2);
  assert.equal((await feesService.createManualPayment(b.id, body, b.bursarId)).status, 'REVERSED');
  await assert.rejects(feesService.reverseManualPayment(b.id, payment.id, 'Change historical reason', b.bursarId), { code: 'REVERSAL_CONFLICT' });
  await assert.rejects(feesService.allocatePayment(b.id, payment.id, [{ invoiceId: second.id, amountNgn: 1 }], b.bursarId), { code: 'INVALID_STATUS' });
  const after = await feesService.bursarSummary(b.id);
  // Successful-payment revenue must exclude the reversed entry.
  assert.equal(before.collectedNgn - after.collectedNgn, 700);
  assert.equal(after.outstandingNgn - before.outstandingNgn, 700);
  await assert.rejects(feesService.cancelInvoice(b.id, second.id, 'Erase reversed history', b.bursarId), { code: 'INVOICE_HAS_PAYMENTS' });
});

check('manual reversal refuses provider payments and is scoped and permission protected', async () => {
  const online = await prisma.payment.create({ data: { organizationId: b.id, amountNgn: 100, source: 'PAYSTACK', method: 'ONLINE', status: 'SUCCESSFUL' } });
  const token = await tokens(b.bursarId, b.id); const parent = await tokens(b.parentUserId, b.id);
  assert.equal((await request('POST', `/fees/payments/${online.id}/reverse`, token.accessToken, { reason: 'Online charge' })).status, 409);
  assert.equal((await request('GET', `/fees/payments/${online.id}`, parent.accessToken)).status, 403);
  assert.equal((await request('POST', `/fees/payments/${online.id}/reverse`, parent.accessToken, { reason: 'Online charge' })).status, 403);
  await assert.rejects(feesService.reverseManualPayment(a.id, online.id, 'Wrong school', a.bursarId), { code: 'NOT_FOUND' });
  assert.equal((await feesService.getPayment(b.id, online.id)).status, 'SUCCESSFUL');
});

check('allocation racing with a manual reversal leaves no active allocation or valid receipt', async () => {
  const bill = await invoice('IT-REVERSE-RACE-0001', 500, b);
  const payment = await feesService.createManualPayment(b.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, method: 'CASH', source: 'MANUAL' }, b.bursarId);
  await Promise.allSettled([feesService.allocatePayment(b.id, payment.id, [{ invoiceId: bill.id, amountNgn: 100 }], b.bursarId),
    feesService.reverseManualPayment(b.id, payment.id, 'Wrong cash entry', b.bursarId)]);
  const current = await feesService.getPayment(b.id, payment.id);
  assert.equal(current.status, 'REVERSED'); assert.ok(current.allocations.every(row => row.reversedAt));
  assert.ok(current.receipts.every(row => row.voidedAt));
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).paidNgn, 0);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).outstandingNgn, 500);
});

check('a provider verification in flight cannot revive a payment closed while waiting', async () => {
  const row = await prisma.payment.create({ data: { organizationId: b.id, amountNgn: 100,
    source: 'PAYSTACK', method: 'ONLINE', status: 'PENDING', providerReference: 'IT-CLOSED-IN-FLIGHT' } });
  mock.method(paystack, 'verifyTransaction', async () => {
    await prisma.payment.update({ where: { id: row.id }, data: { status: 'REFUNDED' } });
    return { status: 'success', amount: 10000, currency: 'NGN', reference: row.providerReference };
  });
  await assert.rejects(feesService.finalizePaystackPayment(row.providerReference), { code: 'PAYMENT_CLOSED' });
  assert.equal((await feesService.getPayment(b.id, row.id)).status, 'REFUNDED');
  assert.equal(await prisma.receipt.count({ where: { paymentId: row.id } }), 0);
});

const { invitationsService } = require('../.test-build/features/auth/invitations.service');
const authEmail = require('../.test-build/lib/authEmail');
async function invitationToken(email) {
  const job = await prisma.authEmail.findFirstOrThrow({ where: { recipient: email }, orderBy: { createdAt: 'desc' } });
  const text = authEmail.decryptAuthEmail(job.encryptedText);
  return new URLSearchParams(new URL(text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
}

check('invitations stay pending, never expose passwords or tokens, and activate once under concurrent acceptance', async () => {
  const email = 'invited.teacher@example.test';
  const owner = await tokens(b.ownerId, b.id);
  const body = { email, firstName: 'Invited', lastName: 'Teacher', role: 'TEACHER' };
  const response = await request('POST', '/memberships', owner.accessToken, body);
  assert.equal(response.status, 201); assert.equal(response.body.data.status, 'PENDING');
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  assert.equal(response.body.data.tokenHash, undefined); assert.equal(response.body.data.token, undefined);
  assert.equal((await request('POST', '/memberships', owner.accessToken, { ...body, password: 'AdminChosen123' })).status, 400);
  const token = await invitationToken(email);
  const jobs = await prisma.authEmail.findMany({ where: { recipient: email } });
  assert.ok(!jobs[0].encryptedText.includes(token));
  const outcomes = await Promise.allSettled([1, 2].map(() => invitationsService.accept(token, 'ChosenPassword123')));
  assert.equal(successful(outcomes).length, 1);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(await prisma.membership.count({ where: { organizationId: b.id, userId: user.id } }), 1);
  const login = await request('POST', '/auth/login', undefined, { email, password: 'ChosenPassword123', schoolSlug: b.slug });
  assert.equal(login.status, 200);
});

check('existing accounts must accept while signed in without changing password or prior school access', async () => {
  const fixtureUser = await prisma.user.findUniqueOrThrow({ where: { id: a.teacherId } });
  const user = await prisma.user.create({ data: { email: 'existing.invited@example.test', firstName: 'Existing', lastName: 'Staff', passwordHash: fixtureUser.passwordHash } });
  await prisma.membership.create({ data: { userId: user.id, organizationId: a.id, role: 'STAFF' } });
  await invitationsService.create(b.id, b.ownerId, { email: user.email, firstName: 'Ignored', lastName: 'Names', role: 'TEACHER' });
  const token = await invitationToken(user.email);
  await assert.rejects(invitationsService.accept(token, 'AttackerPassword123'), { code: 'EXISTING_ACCOUNT_LOGIN' });
  const wrong = await tokens(b.ownerId, b.id);
  assert.equal((await request('POST', '/auth/invitations/accept-existing', wrong.accessToken, { token })).status, 409);
  const original = await tokens(user.id, a.id);
  assert.equal((await request('POST', '/auth/invitations/accept-existing', original.accessToken, { token })).status, 200);
  const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(current.passwordHash, user.passwordHash); assert.equal(current.firstName, user.firstName);
  assert.equal(await prisma.membership.count({ where: { userId: user.id, isActive: true } }), 2);
});

check('reissued, expired and revoked invitations cannot grant access', async () => {
  const input = { email: 'rotated.invite@example.test', firstName: 'Rotate', lastName: 'Invite', role: 'STAFF' };
  const original = await invitationsService.create(b.id, b.ownerId, input);
  const firstToken = await invitationToken(input.email);
  const fresh = await invitationsService.create(b.id, b.ownerId, input);
  const secondToken = await invitationToken(input.email);
  await assert.rejects(invitationsService.accept(firstToken, 'Password123'), { code: 'INVALID_INVITATION' });
  await invitationsService.revoke(b.id, fresh.id, b.ownerId);
  await assert.rejects(invitationsService.accept(secondToken, 'Password123'), { code: 'INVALID_INVITATION' });
  const expired = await invitationsService.create(b.id, b.ownerId, { ...input, email: 'expired.invite@example.test' });
  const expiredToken = await invitationToken('expired.invite@example.test');
  await prisma.schoolInvitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(invitationsService.accept(expiredToken, 'Password123'), { code: 'INVALID_INVITATION' });
  assert.equal(await prisma.user.count({ where: { email: { in: [input.email, 'expired.invite@example.test'] } } }), 0);
  await assert.rejects(invitationsService.revoke(a.id, original.id, a.ownerId), { code: 'NOT_FOUND' });
});

check('parent invitations link the profile only after acceptance and never overwrite a staff membership', async () => {
  const { parentsService } = require('../.test-build/features/parents/parents.service');
  const parent = await prisma.parent.create({ data: { organizationId: b.id, firstName: 'New', lastName: 'Parent' } });
  const input = { email: 'invited.parent@example.test' };
  await parentsService.inviteUser(b.id, parent.id, b.ownerId, input);
  assert.equal((await prisma.parent.findUniqueOrThrow({ where: { id: parent.id } })).userId, null);
  await invitationsService.accept(await invitationToken(input.email), 'ParentPassword123');
  const connected = await prisma.parent.findUniqueOrThrow({ where: { id: parent.id } });
  assert.ok(connected.userId);
  assert.equal((await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: connected.userId, organizationId: b.id } } })).role, 'PARENT');
  const staff = await prisma.user.findUniqueOrThrow({ where: { id: b.teacherId } });
  const other = await prisma.parent.create({ data: { organizationId: b.id, firstName: 'Existing', lastName: 'Staff' } });
  await assert.rejects(parentsService.inviteUser(b.id, other.id, b.ownerId, { email: staff.email }), { code: 'ALREADY_MEMBER' });
  assert.equal((await prisma.parent.findUniqueOrThrow({ where: { id: other.id } })).userId, null);
});

check('password reset responds identically for unknown users and queues an encrypted usable link', async () => {
  const email = (await prisma.user.findUniqueOrThrow({ where: { id: b.bursarId } })).email;
  const known = await request('POST', '/auth/forgot-password', undefined, { email });
  const unknown = await request('POST', '/auth/forgot-password', undefined, { email: 'missing.user@example.test' });
  assert.equal(known.status, 200); assert.deepEqual(known.body.data, unknown.body.data);
  assert.equal(known.body.data.devToken, undefined);
  const reset = await invitationToken(email);
  const session = await tokens(b.bursarId, b.id);
  await authService.resetPassword(reset, 'ResetDelivered123');
  assert.equal((await request('GET', '/auth/me', session.accessToken)).status, 401);
  await assert.rejects(authService.resetPassword(reset, 'AgainPassword123'), { code: 'INVALID_TOKEN' });
});

check('email workers claim each job once and erase the encrypted body after provider acceptance', async () => {
  const { env } = require('../.test-build/config/env');
  const original = env.EMAIL_PROVIDER;
  await prisma.authEmail.updateMany({ data: { status: 'SENT', encryptedText: null } });
  const job = await prisma.authEmail.create({ data: { recipient: 'worker@example.test', subject: 'Test',
    encryptedText: authEmail.encryptAuthEmail('test message'), expiresAt: new Date(Date.now() + 60000) } });
  let calls = 0;
  mock.method(authEmail.authEmailTransport, 'send', async message => { calls++; assert.equal(message.text, 'test message'); });
  env.EMAIL_PROVIDER = 'resend';
  try { await Promise.all([authEmail.processAuthEmail(), authEmail.processAuthEmail()]); }
  finally { env.EMAIL_PROVIDER = original; }
  const saved = await prisma.authEmail.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(calls, 1); assert.equal(saved.status, 'SENT'); assert.equal(saved.encryptedText, null);
});

check('email worker retries failed sends and never sends expired jobs', async () => {
  const { env } = require('../.test-build/config/env'); const original = env.EMAIL_PROVIDER;
  const job = await prisma.authEmail.create({ data: { recipient: 'retry@example.test', subject: 'Test',
    encryptedText: authEmail.encryptAuthEmail('retry body'), expiresAt: new Date(Date.now() + 60000) } });
  const expired = await prisma.authEmail.create({ data: { recipient: 'expired@example.test', subject: 'Test',
    encryptedText: authEmail.encryptAuthEmail('expired body'), expiresAt: new Date(0) } });
  mock.method(authEmail.authEmailTransport, 'send', async () => { throw new Error('test failure'); });
  env.EMAIL_PROVIDER = 'smtp';
  try { await authEmail.processAuthEmail(); }
  finally { env.EMAIL_PROVIDER = original; }
  const saved = await prisma.authEmail.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(saved.status, 'PENDING'); assert.equal(saved.attempts, 1); assert.ok(saved.nextAttemptAt > new Date());
  assert.equal((await prisma.authEmail.findUniqueOrThrow({ where: { id: expired.id } })).encryptedText, null);
});

check('school administrators cannot assign or alter proprietor access', async () => {
  const { membershipsService } = require('../.test-build/features/memberships/memberships.service');
  const admin = await prisma.user.create({ data: { email: 'invitation.admin@example.test', firstName: 'School', lastName: 'Admin' } });
  await prisma.membership.create({ data: { organizationId: b.id, userId: admin.id, role: 'SCHOOL_ADMIN' } });
  await assert.rejects(invitationsService.create(b.id, admin.id,
    { email: 'owner.invite@example.test', firstName: 'Owner', lastName: 'Invite', role: 'PROPRIETOR' }), { code: 'FORBIDDEN' });
  const owner = await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: b.ownerId, organizationId: b.id } } });
  await assert.rejects(membershipsService.update(b.id, owner.id, { userId: admin.id, orgRole: 'SCHOOL_ADMIN' }, { isActive: false }), { code: 'FORBIDDEN' });
  const pending = await invitationsService.create(b.id, admin.id,
    { email: 'unauthorized.later@example.test', firstName: 'Later', lastName: 'Invite', role: 'STAFF' });
  const token = await invitationToken(pending.email);
  await prisma.membership.updateMany({ where: { organizationId: b.id, userId: admin.id }, data: { isActive: false } });
  await assert.rejects(invitationsService.accept(token, 'Password123'), { code: 'INVALID_INVITATION' });
});

check('simultaneous membership changes cannot remove the last proprietor', async () => {
  const { membershipsService } = require('../.test-build/features/memberships/memberships.service');
  const user = await prisma.user.create({ data: { email: 'second.owner@example.test', firstName: 'Second', lastName: 'Owner' } });
  const second = await prisma.membership.create({ data: { organizationId: b.id, userId: user.id, role: 'PROPRIETOR' } });
  const owner = await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: b.ownerId, organizationId: b.id } } });
  try {
    const outcomes = await Promise.allSettled([owner.id, second.id].map(id => membershipsService.update(b.id, id,
      { userId: b.ownerId, orgRole: 'PROPRIETOR' }, { isActive: false })));
    assert.equal(successful(outcomes).length, 1);
    assert.equal(await prisma.membership.count({ where: { organizationId: b.id, role: 'PROPRIETOR', isActive: true } }), 1);
  } finally {
    await prisma.membership.update({ where: { id: owner.id }, data: { isActive: true } });
    await prisma.membership.delete({ where: { id: second.id } });
  }
});

check('an existing user with no active school can accept with their current password without resetting it', async () => {
  const { hashPassword } = require('../.test-build/lib/password');
  const user = await prisma.user.create({ data: { email: 'existing.no.school@example.test', firstName: 'Existing', lastName: 'Transfer',
    passwordHash: await hashPassword('OriginalPassword123') } });
  await invitationsService.create(b.id, b.ownerId, { email: user.email, firstName: 'Ignored', lastName: 'Fields', role: 'STAFF' });
  const token = await invitationToken(user.email);
  const route = '/auth/invitations/accept-existing-password';
  assert.equal((await request('POST', route, undefined, { token, currentPassword: 'WrongPassword123' })).status, 409);
  assert.equal(await prisma.membership.count({ where: { userId: user.id } }), 0);
  assert.equal((await request('POST', route, undefined, { token, currentPassword: 'OriginalPassword123' })).status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, user.passwordHash);
});

check('deactivating a teacher affects only that school membership and assignments', async () => {
  const user = await prisma.user.create({ data: { email: 'teacher.shared@example.test', firstName: 'Shared', lastName: 'Teacher',
    memberships: { create: [{ organizationId: a.id, role: 'TEACHER' }, { organizationId: b.id, role: 'TEACHER' }] } } });
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const aToken = (await tokens(user.id, a.id)).accessToken;
  const bToken = (await tokens(user.id, b.id)).accessToken;
  await prisma.classSubjectTeacher.create({ data: { organizationId: a.id, classId: a.otherClassId, subjectId: a.subjectId, userId: user.id } });
  const result = await request('PATCH', `/teachers/${user.id}`, owner, { isActive: false });
  assert.equal(result.status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive, true);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { organizationId: a.id, userId: user.id } }), 0);
  assert.equal((await request('GET', '/teachers/me/assignments', aToken)).status, 401);
  assert.equal((await request('GET', '/teachers/me/assignments', bToken)).status, 200);
});


async function staffingFixture() {
  const label = crypto.randomUUID();
  const user = await prisma.user.create({ data: { email: `staffing-${label}@example.test`, firstName: 'Staffing', lastName: 'Test',
    memberships: { create: { organizationId: a.id, role: 'TEACHER' } } }, include: { memberships: true } });
  const cls = await prisma.class.create({ data: { organizationId: a.id, name: `Staffing ${label}`, arm: 'A' } });
  const subject = await prisma.subject.create({ data: { organizationId: a.id, name: `Subject ${label}` } });
  await prisma.classSubject.create({ data: { organizationId: a.id, classId: cls.id, subjectId: subject.id } });
  return { user, cls, subject, membership: user.memberships[0], owner: (await tokens(a.ownerId, a.id)).accessToken };
}

check('both staffing APIs reject inactive global accounts, inactive memberships and foreign teachers', async () => {
  const f = await staffingFixture();
  const setClass = id => request('PUT', `/classes/${f.cls.id}/subjects/${f.subject.id}/teacher`, f.owner, { userId: id });
  const setTeacher = id => request('PUT', `/teachers/classes/${f.cls.id}/subject-teachers`, f.owner, { teacherId: id, subjectId: f.subject.id });
  await prisma.user.update({ where: { id: f.user.id }, data: { isActive: false } });
  assert.equal((await setClass(f.user.id)).status, 400); assert.equal((await setTeacher(f.user.id)).status, 400);
  await prisma.user.update({ where: { id: f.user.id }, data: { isActive: true } });
  await prisma.membership.update({ where: { id: f.membership.id }, data: { isActive: false } });
  assert.equal((await setClass(f.user.id)).status, 400); assert.equal((await setTeacher(f.user.id)).status, 400);
  assert.equal((await setClass(b.teacherId)).status, 400); assert.equal((await setTeacher(b.teacherId)).status, 400);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id } }), 0);
});

check('bulk staffing rejects duplicates, unoffered subjects and occupied slots without removing existing assignments', async () => {
  const f = await staffingFixture();
  await prisma.classSubjectTeacher.create({ data: { organizationId: a.id, classId: f.cls.id, subjectId: f.subject.id, userId: f.user.id } });
  const existing = { classId: f.cls.id, subjectId: f.subject.id };
  const bulk = assignments => request('PUT', `/teachers/${f.user.id}/assignments`, f.owner, { assignments });
  assert.equal((await bulk([existing, existing])).status, 400);
  const unoffered = await prisma.subject.create({ data: { organizationId: a.id, name: `Unoffered ${crypto.randomUUID()}` } });
  assert.equal((await bulk([existing, { classId: f.cls.id, subjectId: unoffered.id }])).status, 400);
  assert.equal((await request('PUT', `/teachers/${a.teacherId}/assignments`, f.owner, { assignments: [existing] })).status, 409);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id, userId: f.user.id } }), 1);
  const listing = await request('GET', `/teachers/classes/${f.cls.id}/subject-teachers`, f.owner);
  assert.equal(listing.status, 200); assert.deepEqual(listing.body.data.items.map(row => row.subjectId), [f.subject.id]);
});

check('concurrent class teacher assignment through both APIs preserves one class per teacher', async () => {
  const f = await staffingFixture();
  const second = await prisma.class.create({ data: { organizationId: a.id, name: `Second ${crypto.randomUUID()}` } });
  const results = await Promise.all([
    request('PUT', `/classes/${f.cls.id}/class-teacher`, f.owner, { classTeacherId: f.user.id }),
    request('PUT', `/teachers/classes/${second.id}/class-teacher`, f.owner, { teacherId: f.user.id }),
  ]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal(await prisma.class.count({ where: { organizationId: a.id, classTeacherId: f.user.id } }), 1);
});

check('concurrent curriculum removal and assignment cannot leave a teacher outside the curriculum', async () => {
  const f = await staffingFixture();
  const { classesService } = require('../.test-build/features/classes/classes.service');
  const results = await Promise.allSettled([
    classesService.assignSubjectTeacher(a.id, f.cls.id, f.subject.id, { userId: f.user.id }),
    classesService.removeSubject(a.id, f.cls.id, f.subject.id),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.equal(results[0].reason.code, 'SUBJECT_NOT_LINKED');
  assert.equal(await prisma.classSubject.count({ where: { classId: f.cls.id, subjectId: f.subject.id } }), 0);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id, subjectId: f.subject.id } }), 0);
});

check('concurrent deactivation and staffing changes leave no inactive staff or subject assignments', async () => {
  const { classesService } = require('../.test-build/features/classes/classes.service');
  const { subjectsService } = require('../.test-build/features/subjects/subjects.service');
  const { teacherService } = require('../.test-build/features/teachers/teacher.service');
  const f = await staffingFixture();
  let results = await Promise.allSettled([
    classesService.assignSubjectTeacher(a.id, f.cls.id, f.subject.id, { userId: f.user.id }),
    teacherService.remove(a.id, f.user.id),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.equal(results[0].reason.code, 'INVALID_TEACHER');
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id } }), 0);
  const g = await staffingFixture();
  results = await Promise.allSettled([
    classesService.assignSubjectTeacher(a.id, g.cls.id, g.subject.id, { userId: g.user.id }),
    subjectsService.archive(a.id, g.subject.id),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.equal(results[0].reason.code, 'SUBJECT_NOT_LINKED');
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: g.cls.id } }), 0);
});

check('class archival and loss of teaching role clear staffing while preserving curriculum history', async () => {
  const f = await staffingFixture();
  const assign = () => request('PUT', `/classes/${f.cls.id}/subjects/${f.subject.id}/teacher`, f.owner, { userId: f.user.id });
  assert.equal((await assign()).status, 200);
  assert.equal((await request('PUT', `/classes/${f.cls.id}/class-teacher`, f.owner, { classTeacherId: f.user.id })).status, 200);
  assert.equal((await request('PATCH', `/memberships/${f.membership.id}`, f.owner, { role: 'BURSAR' })).status, 200);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id } }), 0);
  assert.equal((await prisma.class.findUniqueOrThrow({ where: { id: f.cls.id } })).classTeacherId, null);
  assert.equal((await assign()).status, 400);
  assert.equal((await request('PATCH', `/memberships/${f.membership.id}`, f.owner, { role: 'TEACHER' })).status, 200);
  assert.equal((await assign()).status, 200);
  assert.equal((await request('PATCH', `/classes/${f.cls.id}`, f.owner, { isActive: false })).status, 200);
  assert.equal((await assign()).status, 400);
  assert.equal(await prisma.classSubjectTeacher.count({ where: { classId: f.cls.id } }), 0);
  assert.equal(await prisma.classSubject.count({ where: { classId: f.cls.id } }), 1);
});

const studentImportRow = (admissionNumber, rowNumber = 2) => ({ rowNumber, admissionNumber, firstName: 'Imported', lastName: 'Student', className: 'Grade 1', classArm: 'A', dateOfBirth: '2015-02-28' });
check('import dry runs report row errors and never write records or batches', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const before = { students: await prisma.student.count(), batches: await prisma.importBatch.count() };
  const result = await request('POST', '/imports/students', owner, { rows: [
    studentImportRow('PREVIEW-ONLY'), { ...studentImportRow('BAD-DATE', 3), dateOfBirth: '2025-02-30' },
    { ...studentImportRow('BAD-CLASS', 4), className: 'Does not exist' }, { ...studentImportRow('BAD-NAME', 5), firstName: '   ' },
  ] });
  assert.equal(result.status, 200); assert.equal(result.body.data.dryRun, true);
  assert.equal(result.body.data.validCount, 1); assert.equal(result.body.data.errorCount, 3);
  assert.deepEqual(result.body.data.errors.map(row => row.rowNumber).sort(), [3, 4, 5]);
  assert.equal(result.body.data.canCommit, false);
  assert.deepEqual({ students: await prisma.student.count(), batches: await prisma.importBatch.count() }, before);
  assert.equal((await request('POST', '/imports/students', owner, { dryRun: false, rows: [studentImportRow('NO-KEY')] })).status, 400);
});

check('student import retries are atomic and reject changed payloads or duplicate admissions', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const key = crypto.randomUUID(), body = { dryRun: false, idempotencyKey: key, sessionId: a.sessionId, rows: [studentImportRow('IMPORT-RETRY')] };
  const results = await Promise.all([request('POST', '/imports/students', owner, body), request('POST', '/imports/students', owner, body)]);
  assert.deepEqual(results.map(row => row.status), [200, 200]);
  assert.deepEqual(results.map(row => row.body.data.replayed).sort(), [false, true]);
  assert.equal(results[0].body.data.batchId, results[1].body.data.batchId);
  const student = await prisma.student.findFirstOrThrow({ where: { organizationId: a.id, admissionNumber: 'IMPORT-RETRY' } });
  assert.equal(await prisma.student.count({ where: { organizationId: a.id, admissionNumber: 'IMPORT-RETRY' } }), 1);
  assert.equal(await prisma.studentEnrollment.count({ where: { studentId: student.id, sessionId: a.sessionId } }), 1);
  assert.equal((await request('POST', '/imports/students', owner, { ...body, rows: [studentImportRow('CHANGED-IMPORT')] })).status, 409);
  const repeated = await request('POST', '/imports/students', owner, { dryRun: false, idempotencyKey: crypto.randomUUID(), rows: [studentImportRow('import-retry')] });
  assert.equal(repeated.status, 400); assert.equal(repeated.body.error.code, 'IMPORT_HAS_ERRORS');
  const duplicate = await request('POST', '/imports/students', owner, { rows: [studentImportRow(' FILE-DUP ', 2), studentImportRow('file-dup', 3)] });
  assert.equal(duplicate.body.data.errorCount, 1);
});

check('imports enforce school scope and permissions and do not reserve rejected keys', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const parent = (await tokens(a.parentUserId, a.id)).accessToken;
  const key = crypto.randomUUID(), body = { dryRun: false, idempotencyKey: key, rows: [studentImportRow('IMPORT-SCOPE')] };
  assert.equal((await request('POST', '/imports/students', parent, body)).status, 403);
  assert.equal((await request('POST', '/imports/parents', parent, { rows: [{ rowNumber: 2, firstName: 'Bad', lastName: 'Actor' }] })).status, 403);
  assert.equal((await request('POST', '/imports/students', owner, { ...body, sessionId: b.sessionId })).status, 400);
  assert.equal(await prisma.importBatch.count({ where: { organizationId: a.id, idempotencyKey: key } }), 0);
  assert.equal((await request('POST', '/imports/students', owner, body)).status, 200);
  const otherOwner = (await tokens(b.ownerId, b.id)).accessToken;
  assert.equal((await request('POST', '/imports/students', otherOwner, body)).status, 200);
});

check('parent imports group siblings, normalize email and replay without duplicate profiles or child links', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const children = await prisma.student.findMany({ where: { id: { in: [a.studentId, a.otherStudentId] } }, orderBy: { id: 'asc' } });
  const key = crypto.randomUUID(), email = 'imported.family@example.test';
  const body = { dryRun: false, idempotencyKey: key, rows: children.map((student, index) => ({ rowNumber: index + 2,
    firstName: 'Family', lastName: 'Parent', email: ' Imported.Family@Example.Test ', studentAdmissionNumber: student.admissionNumber, relation: 'Guardian' })) };
  const results = await Promise.all([request('POST', '/imports/parents', owner, body), request('POST', '/imports/parents', owner, body)]);
  assert.deepEqual(results.map(row => row.status), [200, 200]);
  assert.deepEqual(results.map(row => row.body.data.replayed).sort(), [false, true]);
  assert.equal(results[0].body.data.created, 1);
  const profile = await prisma.parent.findFirstOrThrow({ where: { organizationId: a.id, email } });
  assert.equal(profile.userId, null); assert.equal(await prisma.parent.count({ where: { organizationId: a.id, email } }), 1);
  assert.equal(await prisma.parentStudent.count({ where: { parentId: profile.id } }), 2);
  assert.equal((await request('POST', '/imports/parents', owner, { ...body, idempotencyKey: crypto.randomUUID() })).status, 400);
});

check('parent import conflicts, duplicate links and foreign student references block the whole batch', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const email = 'conflicting.family@example.test', row = { rowNumber: 2, firstName: 'Same', lastName: 'Family', email };
  const body = { dryRun: false, idempotencyKey: crypto.randomUUID(), rows: [row, { ...row, rowNumber: 3, firstName: 'Different' }] };
  assert.equal((await request('POST', '/imports/parents', owner, body)).status, 400);
  assert.equal(await prisma.parent.count({ where: { email } }), 0);
  const duplicate = await request('POST', '/imports/parents', owner, { rows: [row, { ...row, rowNumber: 3 }] });
  assert.equal(duplicate.body.data.errorCount, 1);
  const foreign = await prisma.student.create({ data: { organizationId: b.id, admissionNumber: `FOREIGN-${crypto.randomUUID()}`, firstName: 'Foreign', lastName: 'Child' } });
  const badLink = await request('POST', '/imports/parents', owner, { rows: [{ ...row, studentAdmissionNumber: foreign.admissionNumber }] });
  assert.equal(badLink.status, 200); assert.equal(badLink.body.data.validCount, 0); assert.equal(badLink.body.data.errorCount, 1);
});

check('concurrent imports recheck the student cap inside the school lock', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: a.id } });
  const active = await prisma.student.count({ where: { organizationId: a.id, isActive: true } });
  await prisma.subscription.update({ where: { organizationId: a.id }, data: { studentCap: active + 1 } });
  try {
    const results = await Promise.all(['CAP-IMPORT-A', 'CAP-IMPORT-B'].map(admissionNumber => request('POST', '/imports/students', owner,
      { dryRun: false, idempotencyKey: crypto.randomUUID(), rows: [studentImportRow(admissionNumber)] })));
    assert.deepEqual(results.map(row => row.status).sort(), [200, 403]);
    assert.equal(await prisma.student.count({ where: { organizationId: a.id, isActive: true } }), active + 1);
  } finally { await prisma.subscription.update({ where: { organizationId: a.id }, data: { studentCap: subscription.studentCap } }); }
});

check('a late audit failure rolls back import records, enrollments, parent links and retry keys', async () => {
  const { importsService } = require('../.test-build/features/imports/imports.service');
  const key = crypto.randomUUID(), studentBody = { dryRun: false, idempotencyKey: key, sessionId: a.sessionId, rows: [studentImportRow('ROLLBACK-IMPORT')] };
  const before = { students: await prisma.student.count(), enrollments: await prisma.studentEnrollment.count(), batches: await prisma.importBatch.count() };
  await assert.rejects(importsService.importStudents(a.id, studentBody, crypto.randomUUID()));
  assert.deepEqual({ students: await prisma.student.count(), enrollments: await prisma.studentEnrollment.count(), batches: await prisma.importBatch.count() }, before);
  assert.equal((await importsService.importStudents(a.id, studentBody, a.ownerId)).created, 1);
  const parentBody = { dryRun: false, idempotencyKey: crypto.randomUUID(), rows: [{ rowNumber: 2, firstName: 'Rollback', lastName: 'Parent',
    email: 'rollback.parent@example.test', studentAdmissionNumber: 'ROLLBACK-IMPORT' }] };
  const parentBefore = { parents: await prisma.parent.count(), links: await prisma.parentStudent.count(), batches: await prisma.importBatch.count() };
  await assert.rejects(importsService.importParents(a.id, parentBody, crypto.randomUUID()));
  assert.deepEqual({ parents: await prisma.parent.count(), links: await prisma.parentStudent.count(), batches: await prisma.importBatch.count() }, parentBefore);
  assert.equal((await importsService.importParents(a.id, parentBody, a.ownerId)).created, 1);
});

check('announcement publication queues email once and rolls back if auditing fails', async () => {
  const { communicationService } = require('../.test-build/features/communication/communication.service');
  const draft = await communicationService.createAnnouncement(a.id, { title: 'Publication test', body: 'Parent update' }, a.ownerId);
  assert.equal(draft.isPublished, false);
  assert.equal(await prisma.notificationOutbox.count({ where: { entityId: draft.id } }), 0);
  const before = await prisma.announcement.count();
  await assert.rejects(communicationService.createAnnouncement(a.id, { title: 'Atomic failure', body: 'Never delivered', publishAt: new Date(Date.now() - 1000).toISOString() }, crypto.randomUUID()));
  assert.equal(await prisma.announcement.count(), before);
  await Promise.all([communicationService.publishAnnouncement(draft.id, a.id, a.ownerId), communicationService.publishAnnouncement(draft.id, a.id, a.ownerId)]);
  const jobs = await prisma.notificationOutbox.findMany({ where: { entityType: 'Announcement', entityId: draft.id } });
  assert.ok(jobs.length > 0); assert.equal(new Set(jobs.map(job => job.recipient)).size, jobs.length);
  assert.ok(jobs.every(job => job.channel === 'email' && job.organizationId === a.id && job.status === 'PENDING'));
  await assert.rejects(communicationService.deleteAnnouncement(b.id, draft.id, true), { statusCode: 404 });
  await communicationService.deleteAnnouncement(a.id, draft.id, true);
  assert.equal(await prisma.notificationOutbox.count({ where: { entityId: draft.id, status: 'PENDING' } }), 0);
});

check('concurrent announcement schedulers publish due items once and leave future or expired items alone', async () => {
  const { communicationService } = require('../.test-build/features/communication/communication.service');
  const due = await prisma.announcement.create({ data: { organizationId: a.id, title: 'Due', body: 'Scheduled', publishAt: new Date(Date.now() - 1000) } });
  const future = await prisma.announcement.create({ data: { organizationId: a.id, title: 'Future', body: 'Future', publishAt: new Date(Date.now() + 86400000) } });
  const expired = await prisma.announcement.create({ data: { organizationId: a.id, title: 'Expired', body: 'Expired', publishAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
  const results = await Promise.all([communicationService.publishScheduledAnnouncements(), communicationService.publishScheduledAnnouncements()]);
  assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
  assert.equal((await prisma.announcement.findUniqueOrThrow({ where: { id: due.id } })).isPublished, true);
  assert.equal((await prisma.announcement.findUniqueOrThrow({ where: { id: future.id } })).isPublished, false);
  assert.equal((await prisma.announcement.findUniqueOrThrow({ where: { id: expired.id } })).isPublished, false);
  assert.equal(await prisma.auditLog.count({ where: { entityId: due.id, entity: 'Announcement' } }), 1);
});

check('notification enqueue keys are school scoped and changed messages conflict', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const body = { eventKey: crypto.randomUUID(), type: 'GENERAL', channel: 'email', recipient: 'notification@example.test', body: 'Message' };
  const results = await Promise.all([request('POST', '/communication/notifications', owner, body), request('POST', '/communication/notifications', owner, body)]);
  assert.deepEqual(results.map(row => row.status), [201, 201]);
  assert.equal(results[0].body.data.id, results[1].body.data.id);
  assert.equal((await request('POST', '/communication/notifications', owner, { ...body, body: 'Changed' })).status, 409);
  assert.equal((await request('POST', '/communication/notifications', owner, { ...body, recipient: 'invalid-email' })).status, 422);
  const parent = (await tokens(a.parentUserId, a.id)).accessToken;
  assert.equal((await request('GET', '/communication/notifications/outbox', parent)).status, 403);
});

async function prepareNotificationJob() {
  await prisma.notificationOutbox.updateMany({ where: { organizationId: a.id, status: 'PENDING', channel: 'email' }, data: { status: 'SENT', lockedAt: null } });
  return prisma.notificationOutbox.create({ data: { organizationId: a.id, type: 'GENERAL', channel: 'email', recipient: 'worker@example.test', body: 'Worker message' } });
}
check('notification worker claims once, respects school/channel scope and marks only provider accepted mail sent', async () => {
  const delivery = require('../.test-build/lib/notificationDelivery'), { env } = require('../.test-build/config/env');
  const job = await prepareNotificationJob();
  const other = await prisma.notificationOutbox.create({ data: { organizationId: b.id, type: 'GENERAL', channel: 'email', recipient: 'other@example.test', body: 'Other school' } });
  const unsupported = await prisma.notificationOutbox.create({ data: { organizationId: a.id, type: 'GENERAL', channel: 'whatsapp', recipient: '+2348012345678', body: 'WhatsApp pending' } });
  const original = env.EMAIL_PROVIDER; env.EMAIL_PROVIDER = 'resend'; let sends = 0;
  mock.method(delivery.notificationTransport, 'send', async message => { sends++; assert.equal(message.id, job.id); });
  try {
    const results = await Promise.all([delivery.processNotificationEmail(a.id), delivery.processNotificationEmail(a.id)]);
    assert.deepEqual(results.map(row => row.status).sort(), ['idle', 'sent']); assert.equal(sends, 1);
    const sent = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(sent.status, 'SENT'); assert.equal(sent.attempts, 1); assert.ok(sent.sentAt); assert.equal(sent.lockedAt, null);
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: other.id } })).attempts, 0);
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: unsupported.id } })).status, 'PENDING');
  } finally { env.EMAIL_PROVIDER = original; }
});

check('notification worker bounds retries, recovers stale leases and suppresses expired deliveries', async () => {
  const delivery = require('../.test-build/lib/notificationDelivery'), { env } = require('../.test-build/config/env');
  const job = await prepareNotificationJob(), original = env.EMAIL_PROVIDER; env.EMAIL_PROVIDER = 'resend';
  mock.method(delivery.notificationTransport, 'send', async () => { throw new Error('provider secret must not persist'); });
  try {
    assert.equal((await delivery.processNotificationEmail(a.id)).status, 'retry');
    let failed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(failed.status, 'PENDING'); assert.equal(failed.error, 'EMAIL_DELIVERY_FAILED'); assert.equal(failed.attempts, 1);
    assert.ok(failed.nextAttemptAt > new Date());
    await prisma.notificationOutbox.update({ where: { id: job.id }, data: { attempts: 4, lockedAt: new Date(Date.now() - 100000), nextAttemptAt: new Date(0) } });
    await delivery.processNotificationEmail(a.id);
    failed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(failed.status, 'FAILED'); assert.equal(failed.attempts, 5);
    const expired = await prisma.notificationOutbox.create({ data: { organizationId: a.id, type: 'GENERAL', channel: 'email', recipient: 'expired@example.test', body: 'Expired', expiresAt: new Date(0) } });
    assert.equal((await delivery.processNotificationEmail(a.id)).status, 'idle');
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: expired.id } })).status, 'CANCELLED');
  } finally { env.EMAIL_PROVIDER = original; }
});

check('disabled delivery does not claim mail and stale workers cannot acknowledge newer leases', async () => {
  const delivery = require('../.test-build/lib/notificationDelivery'), { env } = require('../.test-build/config/env');
  const job = await prepareNotificationJob(), original = env.EMAIL_PROVIDER;
  try {
    env.EMAIL_PROVIDER = 'disabled'; assert.equal((await delivery.processNotificationEmail(a.id)).status, 'disabled');
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } })).attempts, 0);
    env.EMAIL_PROVIDER = 'resend';
    mock.method(delivery.notificationTransport, 'send', async () => { await prisma.notificationOutbox.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lockedAt: new Date() } }); });
    assert.equal((await delivery.processNotificationEmail(a.id)).status, 'lease-lost');
    const current = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(current.status, 'PENDING'); assert.equal(current.attempts, 2); assert.equal(current.sentAt, null);
  } finally { env.EMAIL_PROVIDER = original; }
});

async function eventFamily(email = `event-${crypto.randomUUID()}@example.test`) {
  const child = await prisma.student.create({ data: { organizationId: a.id, classId: a.classId, admissionNumber: `EV-${crypto.randomUUID().slice(0, 12)}`, firstName: 'Event', lastName: 'Child' } });
  const parent = await prisma.parent.create({ data: { organizationId: a.id, firstName: 'Event', lastName: 'Parent', email } });
  await prisma.parentStudent.create({ data: { organizationId: a.id, parentId: parent.id, studentId: child.id } });
  return { child, parent, email };
}
async function eventJobs(entityType, entityId) {
  return prisma.notificationOutbox.findMany({ where: { organizationId: a.id, entityType, entityId }, orderBy: { createdAt: 'asc' } });
}

check('attendance notifications use only active same-school child links and deduplicate recipient emails', async () => {
  const f = await eventFamily();
  const duplicate = await prisma.parent.create({ data: { organizationId: a.id, firstName: 'Duplicate', lastName: 'Contact', email: f.email } });
  const foreign = await prisma.parent.create({ data: { organizationId: b.id, firstName: 'Foreign', lastName: 'Contact', email: 'foreign.events@example.test' } });
  const inactive = await prisma.parent.create({ data: { organizationId: a.id, firstName: 'Inactive', lastName: 'Contact', email: 'inactive.events@example.test', isActive: false } });
  await prisma.parentStudent.createMany({ data: [duplicate, foreign, inactive].map(parent => ({ organizationId: a.id, parentId: parent.id, studentId: f.child.id })) });
  const input = { records: [{ studentId: f.child.id, classId: a.classId, date: '2026-10-12', status: 'ABSENT', clientKey: crypto.randomUUID(), note: 'Private staff note' }] };
  const first = await attendanceService.offlineSync(a.id, a.teacherId, input);
  await attendanceService.offlineSync(a.id, a.teacherId, input);
  const record = first.results[0].record;
  let jobs = await eventJobs('AttendanceRecord', record.id);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].recipient, f.email); assert.equal(jobs[0].status, 'PENDING');
  assert.equal(jobs[0].body.includes('Private staff note'), false);
  await attendanceService.updateOne(a.id, record.id, a.teacherId, { status: 'PRESENT' });
  jobs = await eventJobs('AttendanceRecord', record.id); assert.equal(jobs[0].status, 'CANCELLED');
  await attendanceService.updateOne(a.id, record.id, a.teacherId, { status: 'ABSENT' });
  jobs = await eventJobs('AttendanceRecord', record.id); assert.equal(jobs.length, 2); assert.equal(jobs.filter(job => job.status === 'PENDING').length, 1);
});

check('bulk attendance and offline edits queue only the final committed attendance state', async () => {
  const f = await eventFamily();
  const input = { classId: a.classId, date: '2026-10-11', defaultStatus: 'PRESENT', exceptions: [{ studentId: f.child.id, status: 'LATE' }] };
  const first = await attendanceService.markClassAttendance(a.id, a.teacherId, input);
  await attendanceService.markClassAttendance(a.id, a.teacherId, input);
  const record = first.records.find(row => row.studentId === f.child.id);
  assert.equal((await eventJobs('AttendanceRecord', record.id)).length, 1);
  await attendanceService.offlineSync(a.id, a.teacherId, { records: [
    { studentId: f.child.id, classId: a.classId, date: '2026-10-10', status: 'ABSENT' },
    { studentId: f.child.id, classId: a.classId, date: '2026-10-10', status: 'PRESENT' },
  ] });
  const final = await prisma.attendanceRecord.findUniqueOrThrow({ where: { studentId_date: { studentId: f.child.id, date: new Date('2026-10-10') } } });
  assert.equal(final.status, 'PRESENT'); assert.equal((await eventJobs('AttendanceRecord', final.id)).length, 0);
  await assert.rejects(attendanceService.markClassAttendance(a.id, a.teacherId, { ...input, date: '2026-02-30' }), { code: 'INVALID_DATE' });
});

check('single and bulk result publication are retry safe and unpublication cancels pending notices', async () => {
  const { resultsService } = require('../.test-build/features/results/results.service');
  const f = await eventFamily();
  const result = await prisma.result.create({ data: { organizationId: a.id, studentId: f.child.id, termId: a.termId, classId: a.classId, status: 'APPROVED' } });
  await Promise.all([resultsService.transitionStatus(a.id, result.id, 'PUBLISHED', a.ownerId), resultsService.transitionStatus(a.id, result.id, 'PUBLISHED', a.ownerId)]);
  let jobs = await eventJobs('Result', result.id); assert.equal(jobs.length, 1); assert.equal(jobs[0].recipient, f.email);
  assert.equal(await prisma.auditLog.count({ where: { entityId: result.id, action: 'RESULT_PUBLISHED' } }), 1);
  await resultsService.publishClassTerm(a.id, a.termId, a.classId, false, a.ownerId);
  assert.equal((await eventJobs('Result', result.id))[0].status, 'CANCELLED');
  await resultsService.publishClassTerm(a.id, a.termId, a.classId, true, a.ownerId);
  await resultsService.publishClassTerm(a.id, a.termId, a.classId, true, a.ownerId);
  jobs = await eventJobs('Result', result.id); assert.equal(jobs.length, 2); assert.equal(jobs.filter(job => job.status === 'PENDING').length, 1);
  await assert.rejects(resultsService.publishClassTerm(a.id, a.termId, a.classId, true, a.teacherId), { code: 'FORBIDDEN' });
});

check('manual payment allocation queues allocated receipt amounts once and reversal cancels notices', async () => {
  const f = await eventFamily();
  const bill = await prisma.invoice.create({ data: { organizationId: a.id, studentId: f.child.id, invoiceNumber: `EV-${crypto.randomUUID()}`, totalNgn: 1000, outstandingNgn: 1000, status: 'ISSUED' } });
  const body = { idempotencyKey: crypto.randomUUID(), amountNgn: 500, method: 'CASH', source: 'MANUAL', allocations: [{ invoiceId: bill.id, amountNgn: 200 }] };
  const first = await feesService.createManualPayment(a.id, body, a.bursarId);
  await feesService.createManualPayment(a.id, body, a.bursarId);
  const receipt = first.receipts[0], jobs = await eventJobs('Receipt', receipt.id);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].type, 'RECEIPT'); assert.equal(jobs[0].recipient, f.email);
  assert.match(jobs[0].body, /NGN 200/); assert.equal(jobs[0].body.includes('NGN 500'), false);
  await feesService.reverseManualPayment(a.id, first.id, 'Wrong entry', a.bursarId);
  assert.equal((await eventJobs('Receipt', receipt.id))[0].status, 'CANCELLED');
  const unallocated = await feesService.createManualPayment(a.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 50, method: 'CASH', source: 'MANUAL' }, a.bursarId);
  assert.equal(await prisma.receipt.count({ where: { paymentId: unallocated.id } }), 0);
});

check('repeated provider callbacks create one receipt notification and one payment audit', async () => {
  const f = await eventFamily();
  const bill = await prisma.invoice.create({ data: { organizationId: a.id, studentId: f.child.id, invoiceNumber: `EV-PAY-${crypto.randomUUID()}`, totalNgn: 1000, outstandingNgn: 1000, status: 'ISSUED' } });
  const payment = await prisma.payment.create({ data: { organizationId: a.id, amountNgn: 200, status: 'PENDING', source: 'PAYSTACK', method: 'ONLINE',
    providerReference: `EV-${crypto.randomUUID()}`, providerPayload: { invoiceIds: [bill.id] } } });
  mock.method(paystack, 'verifyTransaction', async () => ({ status: 'success', reference: payment.providerReference, currency: 'NGN', amount: 20000, paid_at: new Date().toISOString() }));
  await Promise.all([feesService.finalizePaystackPayment(payment.providerReference), feesService.finalizePaystackPayment(payment.providerReference)]);
  await feesService.finalizePaystackPayment(payment.providerReference);
  const receipts = await prisma.receipt.findMany({ where: { paymentId: payment.id } });
  assert.equal(receipts.length, 1); assert.equal((await eventJobs('Receipt', receipts[0].id)).length, 1);
  assert.equal(await prisma.auditLog.count({ where: { entity: 'Payment', entityId: payment.id, action: 'PAYMENT_CREATED' } }), 1);
});

check('delivery rechecks current parent links and receipt state before sending generated events', async () => {
  const delivery = require('../.test-build/lib/notificationDelivery'), { env } = require('../.test-build/config/env');
  const f = await eventFamily(), original = env.EMAIL_PROVIDER;
  await prisma.notificationOutbox.updateMany({ where: { organizationId: a.id, channel: 'email', status: 'PENDING' }, data: { status: 'SENT', lockedAt: null } });
  const response = await attendanceService.offlineSync(a.id, a.teacherId, { records: [{ studentId: f.child.id, classId: a.classId, date: '2026-10-09', status: 'ABSENT' }] });
  const notice = (await eventJobs('AttendanceRecord', response.results[0].record.id))[0];
  await prisma.parentStudent.deleteMany({ where: { parentId: f.parent.id, studentId: f.child.id } });
  mock.method(delivery.notificationTransport, 'send', async () => assert.fail('Stale event must not be sent'));
  try {
    env.EMAIL_PROVIDER = 'resend';
    assert.equal((await delivery.processNotificationEmail(a.id)).status, 'cancelled');
    assert.equal((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: notice.id } })).status, 'CANCELLED');
    await prisma.parentStudent.create({ data: { organizationId: a.id, parentId: f.parent.id, studentId: f.child.id } });
    const bill = await prisma.invoice.create({ data: { organizationId: a.id, studentId: f.child.id, invoiceNumber: `EV-STATE-${crypto.randomUUID()}`, totalNgn: 100, outstandingNgn: 100, status: 'ISSUED' } });
    const payment = await feesService.createManualPayment(a.id, { idempotencyKey: crypto.randomUUID(), amountNgn: 100, source: 'MANUAL', method: 'CASH', allocations: [{ invoiceId: bill.id, amountNgn: 100 }] }, a.bursarId);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
    assert.equal((await delivery.processNotificationEmail(a.id)).status, 'cancelled');
    assert.equal((await eventJobs('Receipt', payment.receipts[0].id))[0].status, 'CANCELLED');
  } finally { env.EMAIL_PROVIDER = original; }
});

check('outbox insertion failure rolls back attendance, result publication and payment accounting', async () => {
  const { resultsService } = require('../.test-build/features/results/results.service');
  const f = await eventFamily('events.rollback@example.test');
  const result = await prisma.result.create({ data: { organizationId: a.id, studentId: f.child.id, termId: a.termId, classId: a.classId, status: 'APPROVED' } });
  const bill = await prisma.invoice.create({ data: { organizationId: a.id, studentId: f.child.id, invoiceNumber: `EV-ROLL-${crypto.randomUUID()}`, totalNgn: 100, outstandingNgn: 100, status: 'ISSUED' } });
  const body = { idempotencyKey: crypto.randomUUID(), amountNgn: 100, source: 'MANUAL', method: 'CASH', allocations: [{ invoiceId: bill.id, amountNgn: 100 }] };
  const attendance = { records: [{ studentId: f.child.id, classId: a.classId, date: '2026-10-08', status: 'ABSENT', clientKey: crypto.randomUUID() }] };
  await prisma.$executeRaw`CREATE FUNCTION schoolos_test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OUTBOX_TEST_FAILURE'; END; $$`;
  try {
    await prisma.$executeRaw`CREATE TRIGGER schoolos_test_reject_event BEFORE INSERT ON "NotificationOutbox" FOR EACH ROW WHEN (NEW."recipient" = 'events.rollback@example.test') EXECUTE FUNCTION schoolos_test_reject_event()`;
    const beforeAudit = await prisma.auditLog.count();
    await assert.rejects(attendanceService.offlineSync(a.id, a.teacherId, attendance));
    await assert.rejects(resultsService.transitionStatus(a.id, result.id, 'PUBLISHED', a.ownerId));
    await assert.rejects(feesService.createManualPayment(a.id, body, a.bursarId));
    assert.equal(await prisma.attendanceRecord.count({ where: { studentId: f.child.id } }), 0);
    assert.equal((await prisma.result.findUniqueOrThrow({ where: { id: result.id } })).status, 'APPROVED');
    assert.equal(await prisma.payment.count({ where: { organizationId: a.id, idempotencyKey: body.idempotencyKey } }), 0);
    assert.equal(await prisma.receipt.count({ where: { invoiceId: bill.id } }), 0);
    assert.equal(await prisma.paymentAllocation.count({ where: { invoiceId: bill.id } }), 0);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).outstandingNgn, 100);
    assert.equal(await prisma.auditLog.count(), beforeAudit);
    assert.equal(await prisma.notificationOutbox.count({ where: { recipient: f.email } }), 0);
  } finally {
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS schoolos_test_reject_event ON "NotificationOutbox"`;
    await prisma.$executeRaw`DROP FUNCTION schoolos_test_reject_event()`;
  }
  await attendanceService.offlineSync(a.id, a.teacherId, attendance);
  await resultsService.transitionStatus(a.id, result.id, 'PUBLISHED', a.ownerId);
  await feesService.createManualPayment(a.id, body, a.bursarId);
  assert.equal(await prisma.notificationOutbox.count({ where: { recipient: f.email } }), 3);
});

check('retired PIN, result checker and legacy administration endpoints remain unavailable while public branding works', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  for (const [method, route] of [['POST', '/pins/generate'], ['POST', '/public/pins/verify'], ['POST', '/public/results/verify'],
    ['GET', '/settings'], ['GET', '/academic-sessions'], ['GET', '/platform-admin']]) {
    assert.equal((await request(method, route, owner, method === 'POST' ? { serial: 'OLD', code: 'OLD' } : undefined)).status, 404, route);
  }
  assert.equal((await request('GET', `/public/schools/${a.slug}`)).status, 200);
  assert.equal((await request('GET', '/public/directory')).status, 200);
  assert.equal((await request('GET', '/health')).body.status, 'ok');
  const jwt = require('jsonwebtoken');
  const legacy = jwt.sign({ sub: a.ownerId, schoolId: a.id, role: 'SCHOOL_ADMIN' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '14d' });
  assert.equal((await request('GET', '/staff', legacy)).status, 401);
});

check('staff POST creates a pending invitation and rejects passwords, parents and unauthorized actors', async () => {
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const parent = (await tokens(a.parentUserId, a.id)).accessToken;
  const body = { email: 'staff.alias@example.test', firstName: 'Staff', lastName: 'Invitation', role: 'STAFF' };
  assert.equal((await request('POST', '/staff', parent, body)).status, 403);
  assert.equal((await request('POST', '/staff', owner, { ...body, password: DEFAULT_TEST_PASSWORD })).status, 400);
  assert.equal((await request('POST', '/staff', owner, { ...body, role: 'PARENT' })).status, 400);
  const response = await request('POST', '/staff', owner, body);
  assert.equal(response.status, 201); assert.equal(response.body.data.status, 'PENDING');
  assert.equal(response.body.data.role, 'STAFF');
  assert.equal(await prisma.user.findUnique({ where: { email: body.email } }), null);
  assert.equal(await prisma.membership.count({ where: { organizationId: a.id, user: { email: body.email } } }), 0);
  assert.equal(await prisma.schoolInvitation.count({ where: { organizationId: a.id, email: body.email } }), 1);
});

check('staff roster excludes inactive global accounts and memberships from other schools', async () => {
  const own = await prisma.user.create({ data: { email: `staff-own-${crypto.randomUUID()}@example.test`, firstName: 'Active', lastName: 'Staff', memberships: { create: { organizationId: a.id, role: 'STAFF' } } } });
  const inactive = await prisma.user.create({ data: { email: `staff-off-${crypto.randomUUID()}@example.test`, firstName: 'Inactive', lastName: 'Staff', isActive: false, memberships: { create: { organizationId: a.id, role: 'STAFF' } } } });
  const foreign = await prisma.user.create({ data: { email: `staff-other-${crypto.randomUUID()}@example.test`, firstName: 'Other', lastName: 'Staff', memberships: { create: { organizationId: b.id, role: 'STAFF' } } } });
  const owner = (await tokens(a.ownerId, a.id)).accessToken;
  const response = await request('GET', '/staff', owner);
  assert.equal(response.status, 200);
  const ids = response.body.data.map(row => row.user.id);
  assert.ok(ids.includes(own.id)); assert.equal(ids.includes(inactive.id), false); assert.equal(ids.includes(foreign.id), false);
});

check('one verified parent account can accept school-specific profiles without changing its credentials', async () => {
  const user = await prisma.user.create({ data: { email: 'parent.multischool@example.test', firstName: 'Account', lastName: 'Owner', passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: a.ownerId } })).passwordHash } });
  const profiles = await Promise.all([a, b].map(school => prisma.parent.create({ data: { organizationId: school.id, firstName: school.slug, lastName: 'Parent' } })));
  const pending = [];
  for (const [index, school] of [a, b].entries()) {
    await invitationsService.create(school.id, school.ownerId, { email: user.email, firstName: 'Local', lastName: 'Profile', role: 'PARENT', parentId: profiles[index].id });
    pending.push(await invitationToken(user.email));
  }
  await assert.rejects(invitationsService.accept(pending[0], 'ReplacementPassword123'), { code: 'EXISTING_ACCOUNT_LOGIN' });
  const accepted = await Promise.all(pending.map(token => invitationsService.accept(token, undefined, user.id)));
  assert.deepEqual(new Set(accepted.map(row => row.schoolId)), new Set([a.id, b.id]));
  assert.equal(await prisma.parent.count({ where: { userId: user.id } }), 2);
  const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(current.passwordHash, user.passwordHash); assert.equal(current.firstName, user.firstName);
  const sessions = await Promise.all([a, b].map(school => tokens(user.id, school.id)));
  for (const [index, school] of [a, b].entries()) {
    await prisma.parentStudent.create({ data: { organizationId: school.id, parentId: profiles[index].id, studentId: school.studentId } });
    const fees = await request('GET', '/fees/parent/me', sessions[index].accessToken);
    assert.equal(fees.status, 200);
    assert.ok(fees.body.data.invoices.length > 0);
    assert.ok(fees.body.data.invoices.every(row => row.organizationId === school.id && row.studentId === school.studentId));
    const results = await request('GET', '/results/parent/me', sessions[index].accessToken);
    assert.equal(results.status, 200);
    assert.ok(results.body.data.every(row => row.organizationId === school.id && row.studentId === school.studentId && row.isPublished));
    const other = index === 0 ? b : a;
    assert.equal((await request('GET', `/results/parent/report-cards/${other.publishedResultId}`, sessions[index].accessToken)).status, 404);
    const { parentsService } = require('../.test-build/features/parents/parents.service');
    assert.deepEqual((await parentsService.get(school.id, profiles[index].id)).children.map(row => row.studentId), [school.studentId]);
  }
  await prisma.parent.update({ where: { id: profiles[0].id }, data: { isActive: false } });
  assert.equal((await request('GET', '/fees/parent/me', sessions[0].accessToken)).status, 403);
  assert.equal((await request('GET', '/fees/parent/me', sessions[1].accessToken)).status, 200);
  const extra = await prisma.parent.create({ data: { organizationId: a.id, firstName: 'Duplicate', lastName: 'Profile' } });
  await assert.rejects(invitationsService.create(a.id, a.ownerId, { email: user.email, firstName: 'Duplicate', lastName: 'Profile', role: 'PARENT', parentId: extra.id }), { code: 'PARENT_PROFILE_CONFLICT' });
  await assert.rejects(prisma.parent.update({ where: { id: extra.id }, data: { userId: user.id } }), { code: 'P2002' });
});

check('parent readers reject malformed cross-school child links', async () => {
  const { resultsService } = require('../.test-build/features/results/results.service');
  const { parentsService } = require('../.test-build/features/parents/parents.service');
  const parent = await prisma.parent.create({ data: { organizationId: a.id, firstName: 'Link', lastName: 'Isolation' } });
  const user = await prisma.user.create({ data: { email: 'parent.badlinks@example.test', firstName: 'Link', lastName: 'Isolation' } });
  await prisma.parent.update({ where: { id: parent.id }, data: { userId: user.id } });
  await prisma.parentStudent.createMany({ data: [
    { organizationId: b.id, parentId: parent.id, studentId: a.studentId },
    { organizationId: a.id, parentId: parent.id, studentId: b.studentId },
  ] });
  assert.deepEqual((await parentsService.get(a.id, parent.id)).children, []);
  assert.deepEqual(await feesService.parentFees(a.id, user.id), { children: [] });
  assert.deepEqual(await resultsService.parentResults(a.id, user.id), []);
});

check('acceptance rechecks school profile conflicts after an invitation is issued', async () => {
  const user = await prisma.user.create({ data: { email: 'parent.late-link@example.test', firstName: 'Late', lastName: 'Link' } });
  const target = await prisma.parent.create({ data: { organizationId: b.id, firstName: 'Invited', lastName: 'Profile' } });
  const invite = await invitationsService.create(b.id, b.ownerId, { email: user.email, firstName: 'Invited', lastName: 'Profile', parentId: target.id, role: 'PARENT' });
  const token = await invitationToken(user.email);
  await prisma.parent.create({ data: { organizationId: b.id, userId: user.id, firstName: 'Existing', lastName: 'Profile', isActive: false } });
  await assert.rejects(invitationsService.accept(token, undefined, user.id), { code: 'PARENT_PROFILE_CONFLICT' });
  assert.equal((await prisma.parent.findUniqueOrThrow({ where: { id: target.id } })).userId, null);
  assert.equal((await prisma.schoolInvitation.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt, null);
  assert.equal(await prisma.membership.count({ where: { userId: user.id } }), 0);
});

check('parent overview works before billing/results and excludes other schools, archived children and private account data', async () => {
  const user = await prisma.user.create({ data: { email: 'mvp.parent@example.test', firstName: 'MVP', lastName: 'Account', memberships: { create: [{ organizationId: a.id, role: 'PARENT' }, { organizationId: b.id, role: 'PARENT' }] } } });
  const profiles = await Promise.all([a, b].map(school => prisma.parent.create({ data: { organizationId: school.id, userId: user.id, firstName: school.slug, lastName: 'Contact' } })));
  const child = await prisma.student.create({ data: { organizationId: a.id, admissionNumber: crypto.randomUUID(), firstName: 'Unbilled', lastName: 'Child', classId: a.classId } });
  const archived = await prisma.student.create({ data: { organizationId: a.id, admissionNumber: crypto.randomUUID(), firstName: 'Archived', lastName: 'Child', isActive: false } });
  await prisma.parentStudent.createMany({ data: [
    { organizationId: a.id, parentId: profiles[0].id, studentId: child.id },
    { organizationId: a.id, parentId: profiles[0].id, studentId: archived.id },
    { organizationId: a.id, parentId: profiles[0].id, studentId: b.studentId },
    { organizationId: b.id, parentId: profiles[0].id, studentId: a.studentId },
  ] });
  const tokenA = (await tokens(user.id, a.id)).accessToken, tokenB = (await tokens(user.id, b.id)).accessToken;
  const response = await request('GET', `/parents/me?schoolId=${b.id}&userId=${a.parentUserId}`, tokenA);
  assert.equal(response.status, 200); assert.equal(response.body.data.id, profiles[0].id);
  assert.deepEqual(response.body.data.children.map(row => row.student.id), [child.id]);
  assert.equal(response.body.data.user, undefined); assert.equal(response.body.data.userId, undefined);
  assert.deepEqual((await request('GET', '/parents/me', tokenB)).body.data.children, []);
  assert.equal((await request('GET', '/parents/me')).status, 401);
  assert.equal((await request('GET', '/parents/me', (await tokens(a.ownerId, a.id)).accessToken)).status, 403);
  assert.equal((await request('GET', '/parents', tokenA)).status, 403);
  await prisma.parentStudent.deleteMany({ where: { parentId: profiles[0].id, studentId: child.id } });
  assert.deepEqual((await request('GET', '/parents/me', tokenA)).body.data.children, []);
  await prisma.parent.update({ where: { id: profiles[0].id }, data: { isActive: false } });
  assert.equal((await request('GET', '/parents/me', tokenA)).status, 403);
  assert.equal((await request('GET', '/parents/me', tokenB)).status, 200);
});

check('school members read published announcements without inactive, expired, draft or cross-school content', async () => {
  const now = new Date();
  const create = data => prisma.announcement.create({ data: { organizationId: a.id, title: 'MVP notice', body: 'Notice', ...data } });
  const visible = await create({ isPublished: true, publishedAt: now });
  const hidden = await Promise.all([
    create({ isPublished: false }),
    create({ isPublished: true, isActive: false, publishedAt: now }),
    create({ isPublished: true, expiresAt: new Date(0), publishedAt: now }),
    create({ organizationId: b.id, isPublished: true, publishedAt: now }),
  ]);
  for (const id of [a.parentUserId, a.teacherId]) {
    const token = (await tokens(id, a.id)).accessToken;
    const response = await request('GET', '/communication/announcements?activeOnly=false&limit=100', token);
    assert.equal(response.status, 200);
    assert.ok(response.body.data.some(row => row.id === visible.id));
    assert.ok(hidden.every(row => !response.body.data.some(item => item.id === row.id)));
    for (const row of hidden) assert.equal((await request('GET', `/communication/announcements/${row.id}`, token)).status, 404);
    assert.equal((await request('POST', '/communication/announcements', token, { title: 'Forbidden', body: 'Not allowed' })).status, 403);
  }
});

check('browser clients receive safe malformed-body errors and can read request IDs', async () => {
  const origin = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')[0].trim();
  for (const [body, status, code] of [['{"email":', 400, 'INVALID_JSON'], [JSON.stringify({ payload: 'x'.repeat(2 * 1024 * 1024) }), 413, 'PAYLOAD_TOO_LARGE']]) {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    const error = await response.json(); assert.equal(error.error.code, code); assert.equal(error.success, false);
    assert.equal(error.error.body, undefined);
    assert.ok(response.headers.get('x-request-id'));
    assert.match(response.headers.get('access-control-expose-headers'), /x-request-id/i);
  }
});

check('fresh-school MVP acceptance completes setup, teaching, publication, payment, parent reads and logout through HTTP', async () => {
  const limits = require('../.test-build/middlewares/rateLimit');
  await limits.authLimiter.resetKey('127.0.0.1'); await limits.apiLimiter.resetKey('127.0.0.1');
  const call = async (method, route, token, body) => {
    const response = await request(method, route, token, body);
    assert.ok([200, 201].includes(response.status), `${method} ${route}: ${JSON.stringify(response)}`);
    assert.equal(response.body.success, true); return response.body.data;
  };
  const slug = `acceptance-${crypto.randomUUID()}`, password = 'AcceptancePassword123!';
  const owner = await call('POST', '/auth/register', undefined, { email: `${slug}@example.test`, password, firstName: 'Acceptance', lastName: 'Owner', schoolName: 'Acceptance School', schoolSlug: slug });
  const token = owner.accessToken;
  assert.equal(owner.orgRole, 'PROPRIETOR');
  assert.equal((await call('GET', '/schools/onboarding', token)).readyForCompletion, false);
  const session = await call('POST', '/academic/sessions', token, { name: '2026/2027', isCurrent: true });
  const term = await call('POST', `/academic/sessions/${session.id}/terms`, token, { name: 'FIRST', isCurrent: true,startDate:'2026-09-01',endDate:'2026-12-20' });
  const classroom = await call('POST', '/classes', token, { name: 'Primary 1' });
  const subject = await call('POST', '/subjects', token, { name: 'Mathematics', code: 'MATH' });
  await call('POST', `/classes/${classroom.id}/subjects`, token, { subjectIds: [subject.id] });
  const teacherEmail = `teacher-${slug}@example.test`, parentEmail = `parent-${slug}@example.test`;
  await call('POST', '/memberships', token, { email: teacherEmail, firstName: 'Acceptance', lastName: 'Teacher', role: 'TEACHER' });
  await call('POST', '/auth/invitations/accept', undefined, { token: await invitationToken(teacherEmail), password });
  const teacher = await call('POST', '/auth/login', undefined, { email: teacherEmail, password, schoolSlug: slug });
  await call('PUT', `/classes/${classroom.id}/class-teacher`, token, { classTeacherId: teacher.user.id });
  await call('PUT', `/classes/${classroom.id}/subjects/${subject.id}/teacher`, token, { userId: teacher.user.id });
  const child = await call('POST', '/students', token, { firstName: 'Acceptance', lastName: 'Child', classId: classroom.id });
  await call('POST', `/students/${child.id}/enroll`, token, { sessionId: session.id, classId: classroom.id });
  const parent = await call('POST', '/parents', token, { firstName: 'Acceptance', lastName: 'Parent', email: parentEmail });
  await call('POST', `/parents/${parent.id}/students`, token, { studentId: child.id, relation: 'Guardian' });
  await call('POST', `/parents/${parent.id}/invite`, token, { email: parentEmail });
  await call('POST', '/auth/invitations/accept', undefined, { token: await invitationToken(parentEmail), password });
  const parentLogin = await call('POST', '/auth/login', undefined, { email: parentEmail, password, schoolSlug: slug });
  assert.equal((await call('GET', '/parents/me', parentLogin.accessToken)).children[0].student.id, child.id);
  assert.equal((await call('GET', '/schools/onboarding', token)).readyForCompletion, true);
  assert.equal((await call('POST', '/schools/onboarding/complete', token)).onBoarded, true);
  await call('POST', '/attendance/mark', teacher.accessToken, { classId: classroom.id, date: '2026-10-18', defaultStatus: 'PRESENT' });
  const history = await call('GET', `/attendance/parent/students/${child.id}`, parentLogin.accessToken);
  assert.ok(JSON.stringify(history).includes('PRESENT'));
  const sheet = await call('POST', '/results/sheets', teacher.accessToken, { studentId: child.id, termId: term.id, classId: classroom.id });
  await call('POST', '/results/scores', teacher.accessToken, { resultId: sheet.id, scores: [{ subjectId: subject.id, ca1: 15, ca2: 15, exam: 55 }] });
  assert.deepEqual(await call('GET', '/results/parent/me', parentLogin.accessToken), []);
  await call('PATCH', `/results/${sheet.id}/status`, teacher.accessToken, { status: 'SUBMITTED' });
  assert.equal((await request('PATCH', `/results/${sheet.id}/status`, teacher.accessToken, { status: 'APPROVED' })).status, 403);
  await call('PATCH', `/results/${sheet.id}/status`, token, { status: 'APPROVED' });
  await call('PATCH', `/results/${sheet.id}/status`, token, { status: 'PUBLISHED' });
  const published = await call('GET', '/results/parent/me', parentLogin.accessToken);
  assert.equal(published[0].id, sheet.id); assert.equal(published[0].scores[0].total, 85);
  await call('GET', `/results/parent/report-cards/${sheet.id}`, parentLogin.accessToken);
  const category = await call('POST', '/fees/categories', token, { name: 'Tuition' });
  const structure = await call('POST', '/fees/structures', token, { name: 'First term', sessionId: session.id, termId: term.id, classId: classroom.id, items: [{ feeCategoryId: category.id, amountNgn: 1000 }] });
  const batchInput = { feeStructureId: structure.id, idempotencyKey: crypto.randomUUID() };
  const batch = await call('POST', '/fees/invoices/generate', token, batchInput);
  assert.equal(batch.created, 1);
  assert.equal((await call('POST', '/fees/invoices/generate', token, batchInput)).batchId, batch.batchId);
  const bill = batch.invoices[0];
  const paymentInput = { idempotencyKey: crypto.randomUUID(), amountNgn: 1000, method: 'CASH', allocations: [{ invoiceId: bill.id, amountNgn: 1000 }] };
  await call('POST', '/fees/payments', token, paymentInput);
  await call('POST', '/fees/payments', token, paymentInput);
  const familyFees = await call('GET', '/fees/parent/me', parentLogin.accessToken);
  assert.equal(familyFees.invoices[0].paidNgn, 1000); assert.equal(familyFees.invoices[0].outstandingNgn, 0);
  assert.equal(familyFees.invoices[0].receipts.length, 1);
  const other = (await tokens(b.parentUserId, b.id)).accessToken;
  assert.equal((await request('GET', `/results/parent/report-cards/${sheet.id}`, other)).status, 404);
  assert.equal((await request('GET', `/attendance/parent/students/${child.id}`, other)).status, 404);
  const rotated = await call('POST', '/auth/refresh', undefined, { refreshToken: parentLogin.refreshToken });
  await call('POST', '/auth/logout', rotated.accessToken);
  assert.equal((await request('GET', '/parents/me', rotated.accessToken)).status, 401);
});

check('readiness reflects database failures without exposing diagnostics while liveness stays available', async () => {
  assert.deepEqual((await request('GET', '/health/ready')).body, { status: 'ready' });
  const { readiness } = require('../.test-build/lib/readiness');
  mock.method(readiness, 'checkDatabase', async () => { throw new Error('private database connection details'); });
  const failed = await request('GET', '/health/ready');
  assert.equal(failed.status, 503); assert.deepEqual(failed.body, { status: 'unavailable' });
  assert.equal((await request('GET', '/health')).status, 200);
  assert.equal((await request('GET', '/health/not-a-probe')).status, 404);
});

check('combined email worker attempts every queue even when one task fails', async () => {
  const auth = require('../.test-build/lib/authEmail');
  const notifications = require('../.test-build/lib/notificationDelivery');
  const { communicationService } = require('../.test-build/features/communication/communication.service');
  const { emailWorkerCycle } = require('../.test-build/lib/emailWorkerCycle');
  const calls = [];
  mock.method(auth, 'processAuthEmail', async () => { calls.push('auth'); throw new Error('Provider unavailable'); });
  mock.method(communicationService, 'publishScheduledAnnouncements', async () => { calls.push('scheduled'); });
  mock.method(notifications, 'processNotificationEmail', async () => { calls.push('notifications'); });
  assert.deepEqual(await emailWorkerCycle(), { failures: 1 });
  assert.deepEqual(calls, ['auth', 'scheduled', 'notifications']);
});

check('startup propagates asynchronous listen failures and never listens when database readiness fails', async () => {
  const { startServer } = require('../.test-build/lib/startServer');
  const { createServer } = require('node:http');
  const blocked = createServer();
  const error = Object.assign(new Error('Address unavailable'), { code: 'EADDRINUSE' });
  mock.method(blocked, 'listen', function () { process.nextTick(() => this.emit('error', error)); return this; });
  await assert.rejects(startServer(blocked, 4000, async () => {}), { code: 'EADDRINUSE' });
  assert.equal(blocked.listening, false);
  const unavailable = createServer();
  await assert.rejects(startServer(unavailable, 0, async () => { throw new Error('Database unavailable'); }), /Database unavailable/);
  assert.equal(unavailable.listening, false);
});


check('email/password login auto-selects one school and reveals multiple choices only after valid credentials', async()=>{
 const limits=require('../.test-build/middlewares/rateLimit');await limits.authLimiter.resetKey('127.0.0.1');await limits.apiLimiter.resetKey('127.0.0.1');
 const email='simple-'+crypto.randomUUID()+'@example.test',password='SimpleLogin123!';
 const created=await request('POST','/auth/register',undefined,{email,password,firstName:'Simple',lastName:'Owner',schoolName:'Simple School'});
 assert.equal(created.status,201);const userId=created.body.data.user.id,school=created.body.data.school;
 assert.match(school.slug,/^simple-school-[0-9a-f]+$/);
 let login=await request('POST','/auth/login',undefined,{email,password});assert.equal(login.status,200);assert.equal(login.body.data.school.id,school.id);
 await prisma.membership.create({data:{organizationId:b.id,userId,role:'TEACHER'}});
 const before=await prisma.authSession.count({where:{userId}});
 const wrong=await request('POST','/auth/login',undefined,{email,password:'WrongPassword123'});assert.equal(wrong.status,401);assert.equal(wrong.body.error.details,undefined);
 login=await request('POST','/auth/login',undefined,{email,password});assert.equal(login.status,409);assert.equal(login.body.error.code,'SCHOOL_SELECTION_REQUIRED');assert.equal(login.body.error.details.schools.length,2);assert.equal(login.body.data,undefined);assert.equal(await prisma.authSession.count({where:{userId}}),before);
 const chosen=await request('POST','/auth/login',undefined,{email,password,schoolSlug:b.slug});assert.equal(chosen.status,200);assert.equal(chosen.body.data.school.id,b.id);assert.equal(chosen.body.data.orgRole,'TEACHER');
 await prisma.membership.updateMany({where:{userId,organizationId:b.id},data:{isActive:false}});
 login=await request('POST','/auth/login',undefined,{email,password});assert.equal(login.status,200);assert.equal(login.body.data.school.id,school.id);
 await prisma.organization.update({where:{id:school.id},data:{isActive:false}});
 login=await request('POST','/auth/login',undefined,{email,password});assert.equal(login.status,403);assert.equal(login.body.error.code,'NO_ACTIVE_SCHOOL');
});


check('completed school setup stays complete after requirements change and completion retries are harmless',async()=>{
 const {schoolsService}=require('../.test-build/features/schools/schools.service');
 const school=await prisma.organization.create({data:{name:'Completed setup school',slug:'completed-'+crypto.randomUUID(),createdById:a.ownerId,onBoarded:true}});
 const before=await prisma.auditLog.count({where:{organizationId:school.id}});
 const status=await schoolsService.getOnboarding(school.id);assert.equal(status.completed,true);assert.equal(status.readyForCompletion,false);
 assert.equal((await schoolsService.completeOnboarding(school.id,a.ownerId)).onBoarded,true);
 assert.equal((await schoolsService.getOnboarding(school.id)).completed,true);assert.equal(await prisma.auditLog.count({where:{organizationId:school.id}}),before);
});

check('school-wide fees reach every active student and extra fees target multiple school classes safely', async () => {
 const classes=await Promise.all([1,2].map(n=>prisma.class.create({data:{organizationId:a.id,name:'Fee scope '+n,arm:'Acceptance'}})));
 const students=await Promise.all(classes.map((cls,n)=>prisma.student.create({data:{organizationId:a.id,firstName:'Fee',lastName:'Scope '+n,admissionNumber:'FEE-SCOPE-'+n,classId:cls.id}})));
 const category=await prisma.feeCategory.create({data:{organizationId:a.id,name:'School-wide acceptance fee'}});
 const structure=await prisma.feeStructure.create({data:{organizationId:a.id,name:'School-wide acceptance',items:{create:[{feeCategoryId:category.id,amountNgn:1000}]}}});
 const expected=await prisma.student.findMany({where:{organizationId:a.id,isActive:true},select:{id:true}});
 const input={idempotencyKey:'school-wide-acceptance-001',feeStructureId:structure.id};
 const schoolWide=await feesService.generateInvoices(a.id,input,a.ownerId);
 assert.deepEqual(schoolWide.invoices.map(i=>i.studentId).sort(),expected.map(s=>s.id).sort());
 const selected={...input,idempotencyKey:'class-extra-acceptance-001',classIds:classes.map(c=>c.id)};
 const extra=await feesService.generateInvoices(a.id,selected,a.ownerId);
 assert.deepEqual(extra.invoices.map(i=>i.studentId).sort(),students.map(s=>s.id).sort());
 const replay=await feesService.generateInvoices(a.id,{...selected,classIds:[classes[1].id,classes[0].id,classes[0].id]},a.ownerId);
 assert.equal(replay.replayed,true);assert.equal(replay.batchId,extra.batchId);
 await assert.rejects(feesService.generateInvoices(a.id,{...selected,classIds:[classes[0].id]},a.ownerId),{code:'IDEMPOTENCY_CONFLICT'});
 const foreignClass=await prisma.class.findFirstOrThrow({where:{organizationId:b.id}});
 await assert.rejects(feesService.generateInvoices(a.id,{...input,idempotencyKey:'foreign-class-acceptance',classIds:[foreignClass.id]},a.ownerId),{code:'INVALID_CLASSES'});
 const {generateInvoicesSchema}=require('../.test-build/features/fees/fees.validation');
 assert.equal(generateInvoicesSchema.safeParse({...input,classIds:[]}).success,false);
});

check('fee breakdown estimates recipients and reports received money for only the selected term',async()=>{
 const session=await prisma.academicSession.create({data:{organizationId:a.id,name:'Fee breakdown acceptance'}});
 const term=await prisma.term.create({data:{sessionId:session.id,name:'FIRST'}});
 const cls=await prisma.class.findFirstOrThrow({where:{organizationId:a.id,isActive:true}});
 const recipients=await prisma.student.count({where:{organizationId:a.id,isActive:true,classId:cls.id}});
 assert.ok(recipients>0);
 const category=await prisma.feeCategory.create({data:{organizationId:a.id,name:'Breakdown acceptance'}});
 const plan=await prisma.feeStructure.create({data:{organizationId:a.id,name:'Breakdown fee',termId:term.id,classId:cls.id,items:{create:[{feeCategoryId:category.id,amountNgn:1200}]}}});
 let row=(await feesService.listStructures(a.id)).find(p=>p.id===plan.id);
 assert.equal(row.recipientCount,recipients);assert.equal(row.expectedIncomeNgn,recipients*1200);assert.equal(row.isBilled,false);
 const batch=await feesService.generateInvoices(a.id,{feeStructureId:plan.id,idempotencyKey:'fee-plan-'+plan.id},a.ownerId);
 await feesService.createManualPayment(a.id,{idempotencyKey:crypto.randomUUID(),amountNgn:100,method:'CASH',source:'MANUAL',allocations:[{invoiceId:batch.invoices[0].id,amountNgn:100}]},a.ownerId);
 row=(await feesService.listStructures(a.id)).find(p=>p.id===plan.id);
 assert.equal(row.isBilled,true);assert.equal(row.receivedNgn,100);assert.equal(row.expectedIncomeNgn,recipients*1200);
 const summary=await feesService.bursarSummary(a.id,{termId:term.id});
 assert.equal(summary.collectedNgn,100);assert.equal(summary.billedNgn,recipients*1200);assert.equal(summary.outstandingNgn,recipients*1200-100);
 assert.equal((await feesService.bursarSummary(b.id,{termId:term.id})).collectedNgn,0);
 await feesService.updateStructure(a.id,plan.id,{items:[{feeCategoryId:category.id,amountNgn:1500}]},a.ownerId);
 row=(await feesService.listStructures(a.id)).find(p=>p.id===plan.id);
 assert.equal(row.expectedIncomeNgn,recipients*1200);
});

check('class fee schedules save bills atomically, prevent overlapping fees and keep term totals correct',async()=>{
 const password='ScheduleAcceptance123!';const owner=await authService.registerSchoolAdmin({email:'schedules-'+crypto.randomUUID()+'@example.test',password,firstName:'Fees',lastName:'Owner',schoolName:'Fee schedule school'});
 const org=owner.school.id,actor=owner.user.id,token=owner.accessToken;
 const year=await prisma.academicSession.create({data:{organizationId:org,name:'2026/2027',isCurrent:true}});const term=await prisma.term.create({data:{sessionId:year.id,name:'FIRST',isCurrent:true}});
 const classes=await Promise.all(['SS1','SS2','JSS1'].map(name=>prisma.class.create({data:{organizationId:org,name}})));
 const children=await Promise.all(classes.map((c,index)=>prisma.student.create({data:{organizationId:org,classId:c.id,firstName:'Child',lastName:String(index),admissionNumber:'ASSIGN-'+index}})));
 const items=[{name:'Tuition',amountNgn:12000},{name:'PTA',amountNgn:3500},{name:'Exam',amountNgn:9700},{name:'Sports',amountNgn:300},{name:'Library',amountNgn:2000}];
 const input={idempotencyKey:crypto.randomUUID(),termId:term.id,name:'Senior class fees',classIds:[classes[0].id,classes[1].id],items};
 let saved=await request('POST','/fees/assignments',token,input);assert.equal(saved.status,200,JSON.stringify(saved));const planId=saved.body.data.id;
 assert.equal(saved.body.data.students,2);assert.equal(saved.body.data.expectedNgn,55000);
 assert.equal((await request('POST','/fees/assignments',token,input)).body.data.id,planId);
 assert.equal(await prisma.invoice.count({where:{organizationId:org,feeStructureId:planId}}),2);
 let summary=(await request('GET','/fees/summary?termId='+term.id,token)).body.data;assert.equal(summary.billedNgn,55000);assert.equal(summary.outstandingNgn,55000);assert.equal(summary.collectedNgn,0);
 const junior={...input,idempotencyKey:crypto.randomUUID(),name:'Junior class fees',classIds:[classes[2].id],items:[{name:'Tuition',amountNgn:10000}]};
 assert.equal((await request('POST','/fees/assignments',token,junior)).status,200);
 assert.equal((await request('POST','/fees/assignments',token,{...input,idempotencyKey:crypto.randomUUID()})).status,409);
 const foreign=await prisma.class.findFirstOrThrow({where:{organizationId:b.id}});
 assert.equal((await request('POST','/fees/assignments',token,{...input,idempotencyKey:crypto.randomUUID(),classIds:[foreign.id]})).status,400);
 const tuition=await prisma.invoice.findFirstOrThrow({where:{organizationId:org,feeStructureId:planId,studentId:children[0].id}});
 await feesService.createManualPayment(org,{idempotencyKey:crypto.randomUUID(),amountNgn:5000,method:'CASH',source:'MANUAL',allocations:[{invoiceId:tuition.id,amountNgn:5000}]},actor);
 summary=(await request('GET','/fees/summary?termId='+term.id,token)).body.data;assert.equal(summary.billedNgn,65000);assert.equal(summary.collectedNgn,5000);assert.equal(summary.outstandingNgn,60000);
 const failed=await request('POST','/fees/assignments',token,{...input,id:planId,idempotencyKey:crypto.randomUUID(),items:[{name:'Tuition',amountNgn:1}]});assert.equal(failed.status,409);assert.equal(failed.body.error.code,'FEE_HAS_PAYMENTS');
 assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:tuition.id}})).totalNgn,27500);
 const enrolled=await request('POST','/students',token,{firstName:'New',lastName:'Student',classId:classes[0].id});assert.equal(enrolled.status,201,JSON.stringify(enrolled));
 assert.equal(await prisma.invoice.count({where:{organizationId:org,studentId:enrolled.body.data.id,feeStructureId:planId}}),1);
 summary=(await request('GET','/fees/summary?termId='+term.id,token)).body.data;assert.equal(summary.billedNgn,92500);assert.equal(summary.outstandingNgn,87500);
 const juniorPlan=await prisma.feeStructure.findFirstOrThrow({where:{organizationId:org,name:'Junior class fees'}});
 const edited=await request('POST','/fees/assignments',token,{...junior,id:juniorPlan.id,idempotencyKey:crypto.randomUUID(),items:[{name:'Tuition',amountNgn:9000}]});assert.equal(edited.status,200,JSON.stringify(edited));
 summary=(await request('GET','/fees/summary?termId='+term.id,token)).body.data;assert.equal(summary.billedNgn,91500);assert.equal(summary.outstandingNgn,86500);
 const extra=await request('POST','/fees/assignments',token,{...input,idempotencyKey:crypto.randomUUID(),name:'SS2 practical',classIds:[classes[1].id],items:[{name:'Practical materials',amountNgn:1000}]});assert.equal(extra.status,200);assert.equal(extra.body.data.students,1);
 summary=(await request('GET','/fees/summary?termId='+term.id,token)).body.data;assert.equal(summary.billedNgn,92500);assert.equal(summary.outstandingNgn,87500);
 assert.equal((await request('POST','/fees/assignments',(await tokens(a.teacherId,a.id)).accessToken,input)).status,403);
});
check('receiving bank changes require the creator password and exact, expiring, single-use OTP',async()=>{
 const {env}=require('../.test-build/config/env');const original=env.EMAIL_PROVIDER;env.EMAIL_PROVIDER='smtp';
 try{
 const {readBankAccount,requestBankChange,confirmBankChange}=require('../.test-build/features/schools/bankAccount');const {decryptAuthEmail}=require('../.test-build/lib/authEmail');
 const password='BankAcceptance123!';const owner=await authService.registerSchoolAdmin({email:'bank-'+crypto.randomUUID()+'@example.test',password,firstName:'Bank',lastName:'Owner',schoolName:'Bank acceptance'});
 const auth={userId:owner.user.id,schoolId:owner.school.id,orgRole:'PROPRIETOR',globalRole:'USER',sessionId:'test',permissions:[]};
 const details={bankName:'Test bank',accountName:'School account',accountNumber:'0123456789',password};
 await assert.rejects(requestBankChange(auth,{...details,password:'wrong'}),{code:'REAUTHENTICATION_FAILED'});
 await assert.rejects(requestBankChange({...auth,orgRole:'SCHOOL_ADMIN'},details),{code:'OWNER_ONLY'});
 let pending=await requestBankChange(auth,details);assert.equal(pending.code,undefined);assert.equal(await readBankAccount(auth),null);
 const job=await prisma.authEmail.findFirstOrThrow({where:{recipient:owner.user.email,subject:{contains:'verify bank'}},orderBy:{createdAt:'desc'}});const code=decryptAuthEmail(job.encryptedText).match(/code is (\d{6})/)[1];
 const draft=await prisma.bankAccountChange.findUniqueOrThrow({where:{id:pending.changeId}});assert.ok(!draft.encryptedDetails.includes(details.accountNumber));assert.notEqual(draft.codeHash,code);
 await assert.rejects(confirmBankChange({...auth,userId:a.ownerId},{changeId:pending.changeId,code}),{code:'OWNER_ONLY'});
 const wrong=code==='100000'?'100001':'100000';await assert.rejects(confirmBankChange(auth,{changeId:pending.changeId,code:wrong}),{code:'INVALID_OTP'});assert.equal((await prisma.bankAccountChange.findUniqueOrThrow({where:{id:pending.changeId}})).attempts,1);
 await assert.rejects(confirmBankChange(auth,{changeId:pending.changeId,code,accountNumber:'9999999999'}));
 await confirmBankChange(auth,{changeId:pending.changeId,code});assert.equal((await readBankAccount(auth)).accountNumber,details.accountNumber);
 await assert.rejects(confirmBankChange(auth,{changeId:pending.changeId,code}),{code:'INVALID_OTP'});
 await assert.rejects(requestBankChange(auth,{...details,accountNumber:'1111111111'}),{code:'BANK_CHANGE_COOLDOWN'});
 await prisma.schoolBankAccount.update({where:{organizationId:owner.school.id},data:{updatedAt:new Date(Date.now()-2*86400000)}});
 await prisma.bankAccountChange.updateMany({where:{organizationId:owner.school.id},data:{createdAt:new Date(Date.now()-2*60000)}});
 pending=await requestBankChange(auth,{...details,accountNumber:'1111111111'});
 for(let i=0;i<5;i++)await assert.rejects(confirmBankChange(auth,{changeId:pending.changeId,code:'000000'}),{code:'INVALID_OTP'});
 assert.equal((await prisma.bankAccountChange.findUniqueOrThrow({where:{id:pending.changeId}})).attempts,5);
 assert.equal((await readBankAccount(auth)).accountNumber,details.accountNumber);
 await prisma.bankAccountChange.update({where:{id:pending.changeId},data:{attempts:0,expiresAt:new Date(0)}});
 await assert.rejects(confirmBankChange(auth,{changeId:pending.changeId,code:'000000'}),{code:'INVALID_OTP'});
 assert.equal((await request('GET','/schools/bank-account',(await tokens(a.teacherId,a.id)).accessToken)).status,403);
 assert.ok(await prisma.auditLog.count({where:{organizationId:owner.school.id,entity:'SchoolBankAccount'}})>=4);
 }finally{env.EMAIL_PROVIDER=original;}
});
check('owner overview endpoints aggregate real attendance and incomplete result uploads without writes',async()=>{
 const school=await authService.registerSchoolAdmin({email:'monitor-'+crypto.randomUUID()+'@example.test',password:'MonitorAcceptance123!',firstName:'Monitor',lastName:'Owner',schoolName:'Monitor acceptance'});
 const org=school.school.id,actor=school.user.id,token=(await tokens(actor,org)).accessToken;
 const session=await prisma.academicSession.create({data:{organizationId:org,name:'2026/2027',isCurrent:true}});
 const term=await prisma.term.create({data:{sessionId:session.id,name:'FIRST',isCurrent:true,startDate:new Date('2026-01-01'),endDate:new Date('2026-12-31')}});
 const cls=await prisma.class.create({data:{organizationId:org,name:'SS 1'}});
 const subjects=await Promise.all(['Math','English'].map(name=>prisma.subject.create({data:{organizationId:org,name}})));
 await prisma.classSubject.createMany({data:subjects.map(subject=>({organizationId:org,classId:cls.id,subjectId:subject.id}))});
 const student=await prisma.student.create({data:{organizationId:org,classId:cls.id,firstName:'First',lastName:'Student',admissionNumber:'M1'}});
 await prisma.student.create({data:{organizationId:org,classId:cls.id,firstName:'Second',lastName:'Student',admissionNumber:'M2'}});
 const result=await prisma.result.create({data:{organizationId:org,classId:cls.id,studentId:student.id,termId:term.id,scores:{create:[{subjectId:subjects[0].id,ca1:0,ca2:0,exam:0,total:0},{subjectId:subjects[1].id,ca1:10,ca2:10,exam:null,total:null}]}}});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await prisma.attendanceRecord.create({data:{organizationId:org,classId:cls.id,studentId:student.id,recordedById:actor,date:new Date(today),status:'LATE'}});
 for(const period of ['day','week','term']){
  const response=await request('GET','/dashboard/attendance-overview?period='+period,token);assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.body.data.totals.students,2);assert.equal(response.body.data.totals.late,1);assert.equal(response.body.data.totals.absent,0);assert.equal(response.body.data.totals.rate,100);
 }
 const progress=await request('GET','/dashboard/result-progress?termId='+term.id,token);assert.equal(progress.status,200,JSON.stringify(progress));
 assert.equal(progress.body.data.totals.students,2);assert.equal(progress.body.data.totals.expected,4);assert.equal(progress.body.data.totals.completed,1);assert.equal(progress.body.data.totals.completeReports,0);assert.equal(progress.body.data.classes[0].reports.length,2);
 assert.equal(await prisma.result.count({where:{organizationId:org}}),1);assert.equal((await prisma.result.findUniqueOrThrow({where:{id:result.id}})).status,'DRAFT');
 assert.equal((await request('GET','/dashboard/attendance-overview?period=invalid',token)).status,422);
 assert.equal((await request('GET','/dashboard/result-progress?termId='+crypto.randomUUID(),token)).status,404);
 const parent=(await tokens(a.parentUserId,a.id)).accessToken;
 assert.equal((await request('GET','/dashboard/attendance-overview',parent)).status,403);
 assert.equal((await request('GET','/dashboard/result-progress?termId='+term.id,parent)).status,403);
});
check('fee balance endpoint combines all student bills and excludes cancelled or draft charges',async()=>{
 const school=await authService.registerSchoolAdmin({email:'balances-'+crypto.randomUUID()+'@example.test',password:'BalanceAcceptance123!',firstName:'Balance',lastName:'Owner',schoolName:'Balance acceptance'});
 const org=school.school.id,token=(await tokens(school.user.id,org)).accessToken;
 const session=await prisma.academicSession.create({data:{organizationId:org,name:'2026/2027'}}),term=await prisma.term.create({data:{sessionId:session.id,name:'FIRST'}});
 const student=await prisma.student.create({data:{organizationId:org,firstName:'Ada',lastName:'Obi',admissionNumber:'B1'}});
 for(const bill of [{invoiceNumber:'TUITION',totalNgn:12000,paidNgn:12000,outstandingNgn:0,status:'PAID'},{invoiceNumber:'PTA',totalNgn:3500,paidNgn:0,outstandingNgn:3500,status:'ISSUED'},{invoiceNumber:'CANCELLED',totalNgn:999,paidNgn:0,outstandingNgn:999,status:'CANCELLED'},{invoiceNumber:'DRAFT',totalNgn:999,paidNgn:0,outstandingNgn:999,status:'DRAFT'}])await prisma.invoice.create({data:{organizationId:org,studentId:student.id,termId:term.id,...bill}});
 const response=await request('GET','/fees/student-balances?termId='+term.id+'&search=PTA&paymentState=partial',token);assert.equal(response.status,200,JSON.stringify(response));
 assert.equal(response.body.data.items.length,1);const row=response.body.data.items[0];assert.equal(row.totalNgn,15500);assert.equal(row.paidNgn,12000);assert.equal(row.outstandingNgn,3500);assert.equal(row.bills.length,2);assert.equal(response.body.data.summary.studentsOwing,1);
 assert.equal((await request('GET','/fees/student-balances?termId='+term.id,(await tokens(a.ownerId,a.id)).accessToken)).status,404);
 assert.equal((await request('GET','/fees/student-balances?termId='+term.id,(await tokens(a.parentUserId,a.id)).accessToken)).status,403);
 assert.equal((await request('GET','/fees/student-balances?termId='+term.id+'&pageSize=999',token)).status,422);
});

check('term dates are editable and required on every activation route without disturbing the current calendar',async()=>{
 const school=await authService.registerSchoolAdmin({email:'term-dates-'+crypto.randomUUID()+'@example.test',password:'TermDatesAcceptance123!',firstName:'Calendar',lastName:'Owner',schoolName:'Term dates acceptance'});
 const org=school.school.id,token=(await tokens(school.user.id,org)).accessToken;
 const session=await academicService.createSession(org,{name:'2026/2027',isCurrent:true});
 const term=await academicService.createTerm(org,session.id,{name:'FIRST',isCurrent:false});
 const path='/academic/sessions/'+session.id+'/terms/'+term.id;
 let response=await request('POST',path+'/current',token);assert.equal(response.status,400);assert.equal(response.body.error.code,'TERM_DATES_REQUIRED');
 response=await request('PATCH',path,token,{isCurrent:true});assert.equal(response.status,400);
 response=await request('PATCH',path,token,{startDate:'2026-12-20',endDate:'2026-09-01',isCurrent:true});assert.equal(response.status,400);
 assert.equal((await prisma.term.findUniqueOrThrow({where:{id:term.id}})).isCurrent,false);
 response=await request('PATCH',path,token,{startDate:'2026-02-31',endDate:'2026-12-20'});assert.equal(response.status,400);
 response=await request('PATCH',path,token,{startDate:'2026-09-01',endDate:'2026-12-20',isCurrent:true});assert.equal(response.status,200,JSON.stringify(response));
 assert.equal(response.body.data.startDate.slice(0,10),'2026-09-01');assert.equal(response.body.data.endDate.slice(0,10),'2026-12-20');
 response=await request('PATCH',path,token,{startDate:'2027-01-01'});assert.equal(response.status,400);
 response=await request('PATCH',path,token,{endDate:null});assert.equal(response.status,400);
 assert.equal((await prisma.term.findUniqueOrThrow({where:{id:term.id}})).endDate.toISOString().slice(0,10),'2026-12-20');
 const second=await request('POST','/academic/sessions/'+session.id+'/terms',token,{name:'SECOND',isCurrent:true});assert.equal(second.status,400);
 assert.equal((await academicService.getCurrent(org)).term.id,term.id);
});
check('staff spreadsheet imports validate before writing, replay safely and support pending role assignment',async()=>{
 const owner=await authService.registerSchoolAdmin({email:'staff-import-'+crypto.randomUUID()+'@example.test',password:'StaffImportAcceptance123!',firstName:'Import',lastName:'Owner',schoolName:'Staff import acceptance'});
 const org=owner.school.id,token=(await tokens(owner.user.id,org)).accessToken;
 const input={rows:[{rowNumber:2,firstName:'Ada',lastName:'Obi',email:'staff-a-'+crypto.randomUUID()+'@example.test'},{rowNumber:3,firstName:'Tunde',lastName:'Bello',email:'staff-b-'+crypto.randomUUID()+'@example.test'}]};
 let response=await request('POST','/imports/staff',token,input);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.data.canCommit,true);assert.equal(response.body.data.defaultRole,'TEACHER');assert.equal(await prisma.schoolInvitation.count({where:{organizationId:org}}),0);
 const commit={...input,dryRun:false,idempotencyKey:crypto.randomUUID()};response=await request('POST','/imports/staff',token,commit);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.data.created,2);
 assert.equal((await request('POST','/imports/staff',token,commit)).body.data.replayed,true);assert.equal(await prisma.schoolInvitation.count({where:{organizationId:org}}),2);assert.equal(await prisma.authEmail.count({where:{recipient:{in:input.rows.map(r=>r.email)}}}),2);
 assert.equal((await request('POST','/imports/staff',token,input)).body.data.canCommit,false);
 assert.equal((await request('POST','/imports/staff',token,{...input,defaultRole:'PROPRIETOR'})).status,422);
 const invitation=await prisma.schoolInvitation.findFirstOrThrow({where:{organizationId:org,email:input.rows[0].email}});
 assert.equal((await request('PATCH','/staff/invitations/'+invitation.id+'/role',token,{role:'EXAM_OFFICER'})).status,200);
 const accepted=await request('POST','/auth/invitations/accept',null,{token:await invitationToken(input.rows[0].email),password:'StaffAccepted123!'});assert.equal(accepted.status,200,JSON.stringify(accepted));
 const user=await prisma.user.findUniqueOrThrow({where:{email:input.rows[0].email}});assert.equal((await prisma.membership.findUniqueOrThrow({where:{userId_organizationId:{userId:user.id,organizationId:org}}})).role,'EXAM_OFFICER');
 assert.equal((await request('PATCH','/staff/invitations/'+invitation.id+'/role',token,{role:'BURSAR'})).status,404);
 assert.equal((await request('POST','/imports/staff',(await tokens(a.teacherId,a.id)).accessToken,input)).status,403);
 const second=await prisma.schoolInvitation.findFirstOrThrow({where:{organizationId:org,email:input.rows[1].email}});
 assert.equal((await request('PATCH','/staff/invitations/'+second.id+'/role',(await tokens(a.ownerId,a.id)).accessToken,{role:'BURSAR'})).status,404);
});
check('spreadsheet student import creates the applicable automatic term bills in the same transaction',async()=>{
 const owner=await authService.registerSchoolAdmin({email:'student-sheet-'+crypto.randomUUID()+'@example.test',password:'StudentSheetAcceptance123!',firstName:'Sheet',lastName:'Owner',schoolName:'Student sheet acceptance'});
 const org=owner.school.id,token=(await tokens(owner.user.id,org)).accessToken;
 const year=await prisma.academicSession.create({data:{organizationId:org,name:'2026/2027',isCurrent:true}});
 const term=await prisma.term.create({data:{sessionId:year.id,name:'FIRST',isCurrent:true,startDate:new Date('2026-09-01'),endDate:new Date('2026-12-20')}});
 const cls=await prisma.class.create({data:{organizationId:org,name:'SS 1'}});
 let response=await request('POST','/fees/assignments',token,{idempotencyKey:crypto.randomUUID(),termId:term.id,name:'Tuition',classIds:[cls.id],items:[{name:'Tuition',amountNgn:12000}]});assert.equal(response.status,200,JSON.stringify(response));
 const input={sessionId:year.id,rows:[{rowNumber:2,firstName:'Ada',lastName:'Obi',admissionNumber:'SHEET001',className:'SS 1'}]};
 response=await request('POST','/imports/students',token,input);assert.equal(response.status,200);assert.equal(response.body.data.canCommit,true);
 const committed={...input,dryRun:false,idempotencyKey:crypto.randomUUID()};response=await request('POST','/imports/students',token,committed);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.data.created,1);
 assert.equal((await request('POST','/imports/students',token,committed)).body.data.replayed,true);
 assert.equal(await prisma.student.count({where:{organizationId:org}}),1);assert.equal(await prisma.invoice.count({where:{organizationId:org,termId:term.id}}),1);
 assert.equal((await prisma.invoice.findFirstOrThrow({where:{organizationId:org,termId:term.id}})).outstandingNgn,12000);
});

check('entry permissions follow assignments rather than administrative role', async () => {
 const {assertClassTeacher,assertSubjectTeacher}=require('../.test-build/auth/resourceAccess');
 await assert.rejects(assertClassTeacher(a.id,a.ownerId,a.classId),{statusCode:403});
 await assert.rejects(assertSubjectTeacher(a.id,a.ownerId,a.classId,a.subjectId),{statusCode:403});
 await assertClassTeacher(a.id,a.teacherId,a.classId);
 const assignment=await prisma.classSubjectTeacher.findFirstOrThrow({where:{organizationId:a.id,userId:a.teacherId,classId:a.classId}});
 await assertSubjectTeacher(a.id,a.teacherId,a.classId,assignment.subjectId);
 const previous=await prisma.class.findUniqueOrThrow({where:{id:a.classId}});
 try {
  await prisma.class.update({where:{id:a.classId},data:{classTeacherId:null}});
  await assert.rejects(attendanceService.offlineSync(a.id,a.teacherId,{records:[{studentId:a.studentId,classId:a.classId,date:'2026-10-12',status:'PRESENT'}]}),{statusCode:403});
 } finally {await prisma.class.update({where:{id:a.classId},data:{classTeacherId:previous.classTeacherId}});}
 const token=(await tokens(a.ownerId,a.id)).accessToken;
 const response=await request('GET','/staff/me/assignments',token);
 assert.equal(response.status,200);
});

check('parents pay selected items, retry safely and receive scoped itemized receipts',async()=>{
 const {startParentCheckout,parentPaymentStatus,parentReceipt}=require('../.test-build/features/fees/parentPayments');
 const savedMap=process.env.PAYSTACK_SCHOOL_SUBACCOUNTS,savedWeb=process.env.WEB_URL;
 process.env.PAYSTACK_SCHOOL_SUBACCOUNTS=JSON.stringify({[a.id]:'ACCT_schoolA'});process.env.WEB_URL='https://portal.test';
 const auth={userId:a.parentUserId,schoolId:a.id,orgRole:'PARENT'};
 const bill=await prisma.invoice.create({data:{organizationId:a.id,studentId:a.studentId,invoiceNumber:'PARENT-ITEM-'+crypto.randomUUID(),totalNgn:15500,outstandingNgn:15500,status:'ISSUED',items:{create:[{description:'Tuition',amountNgn:12000},{description:'PTA',amountNgn:3500}]}},include:{items:true}});
 const pta=bill.items.find(i=>i.description==='PTA');
 let calls=0;
 mock.method(paystack,'initializeTransaction',async input=>{calls++;assert.equal(input.amountKobo,350000);assert.equal(input.subaccount,'ACCT_schoolA');assert.equal(input.callback_url,'https://portal.test/parent');return {reference:input.reference,authorization_url:'https://checkout.paystack.com/test',access_code:'test'};});
 mock.method(paystack,'verifyTransaction',async reference=>({status:'success',amount:350000,currency:'NGN',reference}));
 try{
  const body={studentId:a.studentId,itemIds:[pta.id],idempotencyKey:crypto.randomUUID(),callbackOrigin:'https://portal.test'};
  const first=await startParentCheckout(auth,body),retry=await startParentCheckout(auth,body);
  assert.equal(first.reference,retry.reference);assert.equal(calls,1);
  await assert.rejects(startParentCheckout(auth,{...body,studentId:b.studentId,idempotencyKey:crypto.randomUUID()}));
  await assert.rejects(startParentCheckout(auth,{...body,callbackOrigin:'https://evil.test',idempotencyKey:crypto.randomUUID()}),{code:'INVALID_CALLBACK'});
  await Promise.all([parentPaymentStatus(auth,first.reference),parentPaymentStatus(auth,first.reference)]);
  const current=await prisma.invoice.findUniqueOrThrow({where:{id:bill.id}});assert.equal(current.paidNgn,3500);assert.equal(current.outstandingNgn,12000);
  const receipts=await prisma.receipt.findMany({where:{paymentId:first.paymentId}});assert.equal(receipts.length,1);assert.equal(receipts[0].items[0].description,'PTA');assert.equal(receipts[0].items[0].amountNgn,3500);
  const receipt=await parentReceipt(auth,receipts[0].id);assert.equal(receipt.student.admissionNumber,(await prisma.student.findUniqueOrThrow({where:{id:a.studentId}})).admissionNumber);assert.equal(receipt.payment.providerPayload,undefined);
  await assert.rejects(parentReceipt({...auth,userId:b.parentUserId,schoolId:b.id},receipts[0].id),{code:'NOT_FOUND'});
  const overview=await feesService.parentFees(a.id,a.parentUserId),visible=overview.invoices.find(i=>i.id===bill.id);assert.equal(visible.items.find(i=>i.id===pta.id).outstandingNgn,0);assert.equal(visible.items.find(i=>i.description==='Tuition').outstandingNgn,12000);
  assert.equal((await startParentCheckout(auth,body)).reference,first.reference);
  await assert.rejects(startParentCheckout(auth,{...body,itemIds:bill.items.map(i=>i.id)}),{code:'IDEMPOTENCY_CONFLICT'});
 }finally{if(savedMap===undefined)delete process.env.PAYSTACK_SCHOOL_SUBACCOUNTS;else process.env.PAYSTACK_SCHOOL_SUBACCOUNTS=savedMap;if(savedWeb===undefined)delete process.env.WEB_URL;else process.env.WEB_URL=savedWeb;}
});
check('a completed parent payment preserves excess as school credit instead of charging another item',async()=>{
 const bill=await prisma.invoice.create({data:{organizationId:a.id,studentId:a.studentId,invoiceNumber:'PARENT-RACE-'+crypto.randomUUID(),totalNgn:3500,outstandingNgn:3500,status:'ISSUED',items:{create:[{description:'PTA',amountNgn:3500}]}},include:{items:true}});
 const pending=await prisma.payment.create({data:{organizationId:a.id,recordedById:a.parentUserId,amountNgn:3500,method:'ONLINE',source:'PAYSTACK',providerReference:'PARENT-RACE-'+crypto.randomUUID(),providerPayload:{parentUserId:a.parentUserId,studentId:a.studentId,invoiceIds:[bill.id],itemSelections:{[bill.id]:[{invoiceItemId:bill.items[0].id,description:'PTA',amountNgn:3500}]}}}});
 await feesService.createManualPayment(a.id,{idempotencyKey:crypto.randomUUID(),amountNgn:3500,method:'CASH',source:'MANUAL',allocations:[{invoiceId:bill.id,amountNgn:3500}]},a.bursarId);
 mock.method(paystack,'verifyTransaction',async reference=>({status:'success',amount:350000,currency:'NGN',reference}));
 await feesService.finalizePaystackPayment(pending.providerReference);
 assert.equal(await prisma.paymentAllocation.count({where:{paymentId:pending.id}}),0);
 const receipts=await prisma.receipt.findMany({where:{paymentId:pending.id}});assert.equal(receipts.length,1);assert.equal(receipts[0].invoiceId,null);assert.equal(receipts[0].amountNgn,3500);
 const overview=await feesService.parentFees(a.id,a.parentUserId);assert.ok(overview.creditReceipts.some(r=>r.id===receipts[0].id&&r.studentId===a.studentId));
});

check('parents can pay multiple invoices in one checkout and recover provider initialization failure',async()=>{
 const {startParentCheckout,parentPaymentStatus}=require('../.test-build/features/fees/parentPayments');
 const oldMap=process.env.PAYSTACK_SCHOOL_SUBACCOUNTS,oldWeb=process.env.WEB_URL;
 process.env.PAYSTACK_SCHOOL_SUBACCOUNTS=JSON.stringify({[a.id]:'ACCT_schoolA'});process.env.WEB_URL='https://portal.test';
 const auth={userId:a.parentUserId,schoolId:a.id,orgRole:'PARENT'};
 const bills=[];
 for(const [name,amount] of [['Sports',300],['Library',2000]])bills.push(await prisma.invoice.create({data:{organizationId:a.id,studentId:a.studentId,invoiceNumber:'COMBINED-'+crypto.randomUUID(),totalNgn:amount,outstandingNgn:amount,status:'ISSUED',items:{create:[{description:name,amountNgn:amount}]}},include:{items:true}}));
 const body={studentId:a.studentId,itemIds:bills.flatMap(b=>b.items.map(i=>i.id)),idempotencyKey:crypto.randomUUID(),callbackOrigin:'https://portal.test'};
 let calls=0,originalReference;
 mock.method(paystack,'initializeTransaction',async input=>{calls++;assert.equal(input.amountKobo,230000);if(calls===1){originalReference=input.reference;throw Error('Provider temporarily unavailable');}assert.equal(input.reference,originalReference);return {authorization_url:'https://checkout.paystack.com/test',access_code:'test',reference:input.reference};});
 mock.method(paystack,'verifyTransaction',async reference=>({status:'success',amount:230000,currency:'NGN',reference}));
 try{
  await assert.rejects(startParentCheckout(auth,body),/temporarily unavailable/);
  const recovered=await startParentCheckout(auth,body);assert.equal(recovered.reference,originalReference);assert.equal(await prisma.payment.count({where:{organizationId:a.id,idempotencyKey:body.idempotencyKey}}),1);
  await parentPaymentStatus(auth,recovered.reference);
  const receipts=await prisma.receipt.findMany({where:{paymentId:recovered.paymentId}});assert.equal(receipts.length,2);assert.equal(receipts.reduce((sum,r)=>sum+r.amountNgn,0),2300);assert.deepEqual(receipts.flatMap(r=>r.items.map(i=>i.description)).sort(),['Library','Sports']);
  for(const bill of bills)assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:bill.id}})).outstandingNgn,0);
 }finally{if(oldMap===undefined)delete process.env.PAYSTACK_SCHOOL_SUBACCOUNTS;else process.env.PAYSTACK_SCHOOL_SUBACCOUNTS=oldMap;if(oldWeb===undefined)delete process.env.WEB_URL;else process.env.WEB_URL=oldWeb;}
});

check('bursar records one student payment across bills and safely replays concurrent retries',async()=>{
 const child=await prisma.student.create({data:{organizationId:a.id,classId:a.classId,firstName:'Finance',lastName:'Student',admissionNumber:'FIN-'+crypto.randomUUID()}});
 const bills=[];for(const [name,amount] of [['Tuition',4000],['PTA',3500]])bills.push(await prisma.invoice.create({data:{organizationId:a.id,studentId:child.id,termId:a.termId,invoiceNumber:'FIN-'+crypto.randomUUID(),totalNgn:amount,outstandingNgn:amount,status:'ISSUED',items:{create:[{description:name,amountNgn:amount}]}}}));
 const body={idempotencyKey:crypto.randomUUID(),studentId:child.id,termId:a.termId,amountNgn:6500,method:'BANK_TRANSFER',paidAt:new Date().toISOString(),note:'BANK-123',bills:bills.map(bill=>({invoiceId:bill.id,balanceNgn:bill.outstandingNgn}))};
 const token=(await tokens(a.bursarId,a.id)).accessToken;
 const responses=await Promise.all([request('POST','/fees/student-payments',token,body),request('POST','/fees/student-payments',token,body)]);
 assert.ok(responses.every(response=>response.status===201),JSON.stringify(responses));
 assert.equal(await prisma.payment.count({where:{organizationId:a.id,idempotencyKey:body.idempotencyKey}}),1);
 const payment=await prisma.payment.findUniqueOrThrow({where:{organizationId_idempotencyKey:{organizationId:a.id,idempotencyKey:body.idempotencyKey}}});
 const receipts=await prisma.receipt.findMany({where:{paymentId:payment.id}});assert.equal(receipts.length,2);assert.equal(receipts.reduce((sum,row)=>sum+row.amountNgn,0),6500);assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:bills[0].id}})).outstandingNgn,0);assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:bills[1].id}})).outstandingNgn,1000);
 const report=await request('GET','/fees/receipt-documents/'+receipts[0].id,token);assert.equal(report.status,200);assert.ok(report.body.data.items.length);assert.equal(report.body.data.payment.providerPayload,undefined);
 const outsider=(await tokens(b.bursarId,b.id)).accessToken;assert.equal((await request('GET','/fees/receipt-documents/'+receipts[0].id,outsider)).status,404);
 const parent=(await tokens(a.parentUserId,a.id)).accessToken;assert.equal((await request('POST','/fees/student-payments',parent,body)).status,403);
 await assert.rejects(feesService.recordStudentPayment(a.id,{...body,amountNgn:6000},a.bursarId),{code:'IDEMPOTENCY_CONFLICT'});
});
check('stale offline student payments roll back entirely and cannot be moved to other children',async()=>{
 const child=await prisma.student.create({data:{organizationId:a.id,classId:a.classId,firstName:'Offline',lastName:'Review',admissionNumber:'OFF-'+crypto.randomUUID()}});
 const bill=await prisma.invoice.create({data:{organizationId:a.id,studentId:child.id,termId:a.termId,invoiceNumber:'OFF-'+crypto.randomUUID(),totalNgn:100,outstandingNgn:100,status:'ISSUED'}});
 const input={idempotencyKey:crypto.randomUUID(),studentId:child.id,termId:a.termId,amountNgn:80,method:'CASH',paidAt:new Date().toISOString(),bills:[{invoiceId:bill.id,balanceNgn:100}]};
 await feesService.createManualPayment(a.id,{idempotencyKey:crypto.randomUUID(),amountNgn:40,method:'CASH',source:'MANUAL',allocations:[{invoiceId:bill.id,amountNgn:40}]},a.bursarId);
 await assert.rejects(feesService.recordStudentPayment(a.id,input,a.bursarId),{code:'BALANCE_CHANGED'});
 assert.equal(await prisma.payment.count({where:{organizationId:a.id,idempotencyKey:input.idempotencyKey}}),0);
 await assert.rejects(feesService.recordStudentPayment(a.id,{...input,studentId:a.studentId,amountNgn:10,bills:[{invoiceId:bill.id,balanceNgn:60}]},a.bursarId),{code:'BALANCE_CHANGED'});
 await assert.rejects(feesService.recordStudentPayment(a.id,{...input,termId:b.termId},a.bursarId),{code:'TERM_NOT_FOUND'});
 const saved=await feesService.recordStudentPayment(a.id,{...input,amountNgn:60,bills:[{invoiceId:bill.id,balanceNgn:60}]},a.bursarId);assert.equal(saved.amountNgn,60);
});
check('finance workspace uses complete term bills and all-time unallocated credits with school-scoped totals',async()=>{
 const {financeWorkspace}=require('../.test-build/features/fees/financeWorkspace');
 for(let index=0;index<28;index++){
  const student=await prisma.student.create({data:{organizationId:a.id,classId:a.classId,firstName:'Report',lastName:'Student '+index,admissionNumber:'RPT-'+crypto.randomUUID()}});
  await prisma.invoice.create({data:{organizationId:a.id,studentId:student.id,termId:a.termId,invoiceNumber:'RPT-'+crypto.randomUUID(),totalNgn:100,outstandingNgn:100,status:'ISSUED'}});
 }
 const credit=await feesService.createManualPayment(a.id,{idempotencyKey:crypto.randomUUID(),studentId:a.studentId,amountNgn:250,method:'CASH',source:'MANUAL',allocations:[]},a.bursarId);
 const workspace=await financeWorkspace(a.id,{termId:a.termId});assert.ok(workspace.students.length>=28);assert.equal(workspace.daily.length,14);
 const totals=await prisma.invoice.aggregate({where:{organizationId:a.id,termId:a.termId,status:{notIn:['DRAFT','CANCELLED']}},_sum:{totalNgn:true,paidNgn:true,outstandingNgn:true}});
 assert.equal(workspace.totals.expectedNgn,totals._sum.totalNgn);assert.equal(workspace.totals.receivedNgn,totals._sum.paidNgn);assert.equal(workspace.totals.outstandingNgn,totals._sum.outstandingNgn);
 assert.equal(workspace.credits.find(row=>row.paymentId===credit.id).creditNgn,250);assert.equal(workspace.credits.find(row=>row.paymentId===credit.id).studentId,a.studentId);assert.ok(!JSON.stringify(workspace).includes('providerPayload'));
 await feesService.reverseManualPayment(a.id,credit.id,'Test credit reversed',a.bursarId);assert.ok(!(await financeWorkspace(a.id,{termId:a.termId})).credits.some(row=>row.paymentId===credit.id));
 await assert.rejects(financeWorkspace(a.id,{termId:b.termId}),{code:'TERM_NOT_FOUND'});
 const parent=(await tokens(a.parentUserId,a.id)).accessToken;assert.equal((await request('GET','/fees/workspace?termId='+a.termId,parent)).status,403);
 const bursar=(await tokens(a.bursarId,a.id)).accessToken;assert.equal((await request('GET','/fees/workspace?termId='+a.termId,bursar)).status,200);
});

check('offline student payment sync rechecks active payment permission inside the transaction',async()=>{
 const membership=await prisma.membership.findFirstOrThrow({where:{organizationId:a.id,userId:a.bursarId}});
 try{
  await prisma.membership.update({where:{id:membership.id},data:{isActive:false}});
  await assert.rejects(feesService.recordStudentPayment(a.id,{idempotencyKey:crypto.randomUUID(),studentId:a.studentId,termId:a.termId,amountNgn:1,method:'CASH',paidAt:new Date().toISOString(),bills:[{invoiceId:a.invoiceId,balanceNgn:1}]},a.bursarId),{code:'FORBIDDEN'});
 }finally{await prisma.membership.update({where:{id:membership.id},data:{isActive:membership.isActive}});}
});

async function examFixture(){
 const label=crypto.randomUUID();const session=await prisma.academicSession.create({data:{organizationId:a.id,name:'Exams '+label}});const term=await prisma.term.create({data:{sessionId:session.id,name:'FIRST',startDate:new Date('2026-10-01'),endDate:new Date('2026-12-20')}});
 const classes=[];for(const name of ['One','Two'])classes.push(await prisma.class.create({data:{organizationId:a.id,name:'Exam '+name+' '+label}}));
 const subjects=[];for(const name of ['Math','English'])subjects.push(await prisma.subject.create({data:{organizationId:a.id,name:name+' '+label}}));for(const cls of classes)for(const subject of subjects)await prisma.classSubject.create({data:{organizationId:a.id,classId:cls.id,subjectId:subject.id}});
 const officer=await prisma.user.create({data:{email:'exam-officer-'+label+'@example.test',firstName:'Exam',lastName:'Officer',memberships:{create:{organizationId:a.id,role:'EXAM_OFFICER'}}}});const teacher=await prisma.user.create({data:{email:'exam-teacher-'+label+'@example.test',firstName:'Exam',lastName:'Teacher',memberships:{create:{organizationId:a.id,role:'TEACHER'}}}});
 await prisma.classSubjectTeacher.create({data:{organizationId:a.id,userId:teacher.id,classId:classes[0].id,subjectId:subjects[0].id}});
 const parentUser=await prisma.user.create({data:{email:'exam-parent-'+label+'@example.test',firstName:'Exam',lastName:'Parent',memberships:{create:{organizationId:a.id,role:'PARENT'}}}});const parent=await prisma.parent.create({data:{organizationId:a.id,userId:parentUser.id,firstName:'Exam',lastName:'Parent'}});
 const children=[];for(const cls of classes)children.push(await prisma.student.create({data:{organizationId:a.id,classId:cls.id,firstName:'Exam',lastName:'Child',admissionNumber:'EX-'+crypto.randomUUID()}}));await prisma.parentStudent.create({data:{organizationId:a.id,parentId:parent.id,studentId:children[0].id}});
 const entries=classes.map(cls=>({id:crypto.randomUUID(),classId:cls.id,subjectId:subjects[0].id,date:'2026-11-10',startTime:'09:00',endTime:'11:00',venue:'Shared hall',note:''}));
 return {term,classes,subjects,officer,teacher,parentUser,children,entries,officerToken:(await tokens(officer.id,a.id)).accessToken,teacherToken:(await tokens(teacher.id,a.id)).accessToken,parentToken:(await tokens(parentUser.id,a.id)).accessToken};
}
check('exam timetable drafts stay private, publishing is scoped and device retries preserve versions',async()=>{
 const f=await examFixture();const body={termId:f.term.id,expectedVersion:0,title:'November exams',entries:f.entries};
 let response=await request('PUT','/exams/timetable',f.officerToken,body);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.data.version,1);
 assert.equal((await request('GET','/exams/editor?termId='+f.term.id,f.teacherToken)).status,403);
 let parent=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(parent.body.data.publishedAt,null);assert.equal(parent.body.data.entries.length,0);
 response=await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:1});assert.equal(response.status,200);assert.equal(response.body.data.version,2);
 const repeated=await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:1});assert.equal(repeated.body.data.version,2);
 const teacher=await request('GET','/exams/published?termId='+f.term.id,f.teacherToken);assert.equal(teacher.body.data.entries.length,1);assert.equal(teacher.body.data.entries[0].classId,f.classes[0].id);
 parent=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(parent.body.data.entries.length,1);assert.equal(parent.body.data.entries[0].classId,f.classes[0].id);assert.equal(parent.body.data.hasUnpublishedChanges,undefined);
 assert.equal((await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[1].id,f.parentToken)).status,404);
 assert.equal((await request('GET','/exams/editor?termId='+f.term.id,(await tokens(b.ownerId,b.id)).accessToken)).status,404);
 const edited={...body,expectedVersion:2,entries:f.entries.map(entry=>({...entry,note:'Bring a calculator'}))};response=await request('PUT','/exams/timetable',f.officerToken,edited);assert.equal(response.body.data.version,3);
 parent=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(parent.body.data.entries[0].note,'');
 const replay=await request('PUT','/exams/timetable',f.officerToken,edited);assert.equal(replay.status,200);assert.equal(replay.body.data.version,3);
 assert.equal((await request('PUT','/exams/timetable',f.officerToken,{...edited,title:'Stale overwrite'})).status,409);
 response=await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:3});assert.equal(response.body.data.version,4);
 parent=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(parent.body.data.entries[0].note,'Bring a calculator');
 response=await request('POST','/exams/timetable/unpublish',f.officerToken,{termId:f.term.id,expectedVersion:4});assert.equal(response.body.data.version,5);assert.equal(response.body.data.entries.length,2);
 parent=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(parent.body.data.publishedAt,null);assert.equal(parent.body.data.entries.length,0);
});
check('exam timetables reject class clashes, venue clashes, foreign curriculum and out-of-term dates',async()=>{
 const f=await examFixture(),base={termId:f.term.id,expectedVersion:0,title:'Exams'};
 for(const [entries,code]of [
 [[f.entries[0],{...f.entries[0],id:crypto.randomUUID(),subjectId:f.subjects[1].id,startTime:'10:00'}],'CLASS_EXAM_CLASH'],
 [[f.entries[0],{...f.entries[1],subjectId:f.subjects[1].id,startTime:'10:00'}],'VENUE_EXAM_CLASH'],
 [[{...f.entries[0],classId:b.classId}],'SUBJECT_NOT_LINKED'],
 [[{...f.entries[0],date:'2027-01-01'}],'EXAM_OUTSIDE_TERM']]){const response=await request('PUT','/exams/timetable',f.officerToken,{...base,entries});assert.equal(response.body.error.code,code,JSON.stringify(response));}
 assert.equal(await prisma.examTimetable.count({where:{organizationId:a.id,termId:f.term.id}}),0);
 const valid=[f.entries[0],{...f.entries[0],id:crypto.randomUUID(),subjectId:f.subjects[1].id,startTime:'11:00',endTime:'12:00'}];assert.equal((await request('PUT','/exams/timetable',f.officerToken,{...base,entries:valid})).status,200);
 await prisma.classSubject.delete({where:{classId_subjectId:{classId:f.classes[0].id,subjectId:f.subjects[0].id}}});
 const response=await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:1});assert.equal(response.body.error.code,'SUBJECT_NOT_LINKED');assert.equal((await prisma.examTimetable.findUniqueOrThrow({where:{organizationId_termId_kind:{organizationId:a.id,termId:f.term.id,kind:'EXAM'}}})).publishedAt,null);
});
check('exam publication checks current role, serializes conflicting writers and leaves score assignments enforced',async()=>{
 const f=await examFixture(),service=require('../.test-build/features/exams/exams.service');const base={termId:f.term.id,expectedVersion:0,title:'Exams',entries:f.entries};
 const outcomes=await Promise.allSettled([service.saveExamTimetable(a.id,f.officer.id,base),service.saveExamTimetable(a.id,f.officer.id,{...base,title:'Another editor'})]);assert.equal(successful(outcomes).length,1);assert.equal(outcomes.find(outcome=>outcome.status==='rejected').reason.code,'TIMETABLE_CHANGED');
 const membership=await prisma.membership.findFirstOrThrow({where:{organizationId:a.id,userId:f.officer.id}});await prisma.membership.update({where:{id:membership.id},data:{role:'TEACHER'}});
 await assert.rejects(service.publishExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:1}),{code:'FORBIDDEN'});
 await prisma.membership.update({where:{id:membership.id},data:{role:'EXAM_OFFICER'}});
 const scores={classId:f.classes[0].id,termId:f.term.id,subjectId:f.subjects[0].id,entries:[{studentId:f.children[0].id,ca1:10,ca2:20,exam:60}]};
 assert.equal((await request('POST','/results/scores/bulk',f.officerToken,scores)).status,403);
 await prisma.classSubjectTeacher.update({where:{classId_subjectId:{classId:f.classes[0].id,subjectId:f.subjects[0].id}},data:{userId:f.officer.id}});
 assert.equal((await request('POST','/results/scores/bulk',f.officerToken,scores)).status,200);
 const bursar=(await tokens(a.bursarId,a.id)).accessToken;assert.equal((await request('GET','/exams/published?termId='+f.term.id,bursar)).status,403);assert.equal((await request('PUT','/exams/timetable',bursar,base)).status,403);
});

check('exam publishing rejects empty schedules and changed term boundaries',async()=>{
 const f=await examFixture(),service=require('../.test-build/features/exams/exams.service');
 const empty=await service.saveExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:0,title:'Exams',entries:[]});
 await assert.rejects(service.publishExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:empty.version}),{code:'EMPTY_TIMETABLE'});
 const saved=await service.saveExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:1,title:'Exams',entries:f.entries});
 await prisma.term.update({where:{id:f.term.id},data:{endDate:new Date('2026-11-01')}});
 await assert.rejects(service.publishExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:saved.version}),{code:'EXAM_OUTSIDE_TERM'});
 await prisma.term.update({where:{id:f.term.id},data:{startDate:null,endDate:null}});
 await assert.rejects(service.saveExamTimetable(a.id,f.officer.id,{termId:f.term.id,expectedVersion:saved.version,title:'Exams',entries:f.entries}),{code:'TERM_DATES_REQUIRED'});
});

check('an invited pre-created account can choose its first password through the public route', async () => {
  const email = `first-password-${crypto.randomUUID()}@example.test`;
  const user = await prisma.user.create({ data: { email, firstName: 'Imported', lastName: 'Person' } });
  await invitationsService.create(b.id, b.ownerId, { email, firstName: 'Imported', lastName: 'Person', role: 'TEACHER' });
  const token = await invitationToken(email);
  const route = '/auth/invitations/accept';
  const invalid = await request('POST', route, undefined, { token, password: 'lettersOnly' });
  assert.equal(invalid.status, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, null);
  const accepted = await request('POST', route, undefined, { token, password: 'FirstPassword123!' });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const { verifyPassword } = require('../.test-build/lib/password');
  assert.equal(await verifyPassword('FirstPassword123!', updated.passwordHash), true);
  assert.equal((await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: user.id, organizationId: b.id } } })).role, 'TEACHER');
  assert.equal((await request('POST', route, undefined, { token, password: 'OtherPassword123' })).status, 400);
});

check('new staff can accept an emailed invitation over HTTP and sign in with the chosen password', async () => {
  const email = `new-invite-${crypto.randomUUID()}@example.test`;
  await invitationsService.create(b.id, b.ownerId, { email, firstName: 'New', lastName: 'Teacher', role: 'TEACHER' });
  const token = await invitationToken(email);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } });
  const ownerSession = await tokens(b.ownerId, b.id);
  const preview = await request('POST', '/auth/invitations/inspect', ownerSession.accessToken, { token });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.email, email);
  assert.equal(preview.body.data.needsPassword, true);
  assert.equal(preview.body.data.passwordHash, undefined);
  const result = await request('POST', '/auth/invitations/accept', ownerSession.accessToken, { token, password: 'ChosenPassword123!' });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: b.ownerId } })).passwordHash, owner.passwordHash);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await request('POST', '/auth/invitations/inspect', ownerSession.accessToken, { token })).status, 400);
  const login = await request('POST', '/auth/login', undefined, { email, password: 'ChosenPassword123!' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.data.orgRole, 'TEACHER');
  assert.equal(login.body.data.school.id, b.id);
  assert.ok(login.body.data.accessToken);
});

check('invitation inspection recognises existing-password accounts and rejects expired or used links', async () => {
  const user = await prisma.user.create({ data: { email: `inspect-${crypto.randomUUID()}@example.test`, firstName: 'Existing', lastName: 'Invite', passwordHash: 'not-returned' } });
  await invitationsService.create(b.id, b.ownerId, { email: user.email, firstName: 'Existing', lastName: 'Invite', role: 'STAFF' });
  const token = await invitationToken(user.email);
  assert.equal((await invitationsService.inspect(token)).needsPassword, false);
  await prisma.schoolInvitation.update({ where: { tokenHash: sha256(token) }, data: { expiresAt: new Date(0) } });
  await assert.rejects(invitationsService.inspect(token), { code: 'INVALID_INVITATION' });
  await assert.rejects(invitationsService.inspect('nonexistent'.repeat(6)), { code: 'INVALID_INVITATION' });
});

check('email-only staff invitation defaults to Teacher and completes with names and an invited session',async()=>{
 const owner=await tokens(b.ownerId,b.id),email=`email-only-${crypto.randomUUID()}@example.test`;
 const invited=await request('POST','/teachers/invite',owner.accessToken,{email});assert.equal(invited.status,201,JSON.stringify(invited.body));assert.equal(invited.body.data.invitation.role,'TEACHER');
 const token=await invitationToken(email);
 const missing=await request('POST','/auth/invitations/complete',owner.accessToken,{token,password:'ChosenPassword123'});assert.equal(missing.status,400);assert.equal(missing.body.error.code,'PROFILE_REQUIRED');
 const accepted=await request('POST','/auth/invitations/complete',owner.accessToken,{token,password:'ChosenPassword123',firstName:'New',lastName:'Teacher'});
 assert.equal(accepted.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.data.user.email,email);assert.equal(accepted.body.data.user.firstName,'New');assert.equal(accepted.body.data.orgRole,'TEACHER');assert.notEqual(accepted.body.data.user.id,b.ownerId);
 const me=await request('GET','/auth/me',accepted.body.data.accessToken);assert.equal(me.status,200);assert.equal(me.body.data.user.email,email);
 assert.equal((await request('POST','/auth/invitations/complete',undefined,{token,password:'ChosenPassword123',firstName:'New',lastName:'Teacher'})).status,400);
});
check('email-only bulk import previews, rejects duplicates, commits and safely retries as Teacher',async()=>{
 const {importStaff}=require('../.test-build/features/imports/staffImport');
 const rows=[{rowNumber:2,email:`bulk-email-${crypto.randomUUID()}@example.test`},{rowNumber:3,email:`bulk-email-${crypto.randomUUID()}@example.test`}];
 const preview=await importStaff(b.id,b.ownerId,{rows});assert.equal(preview.canCommit,true);assert.equal(preview.defaultRole,'TEACHER');
 const duplicates=await importStaff(b.id,b.ownerId,{rows:[rows[0],{rowNumber:3,email:rows[0].email}]});assert.equal(duplicates.canCommit,false);
 const input={rows,dryRun:false,idempotencyKey:crypto.randomUUID()};const committed=await importStaff(b.id,b.ownerId,input);assert.equal(committed.created,2);assert.equal((await importStaff(b.id,b.ownerId,input)).replayed,true);
 const pending=await prisma.schoolInvitation.findMany({where:{organizationId:b.id,email:{in:rows.map(row=>row.email)}}});assert.equal(pending.length,2);assert.ok(pending.every(row=>row.role==='TEACHER'&&!row.firstName&&!row.lastName));
});
function signedGoogleIdentity(claims={}){
 const {generateKeyPairSync}=require('node:crypto');const {OAuth2Client}=require('google-auth-library');const jwt=require('jsonwebtoken');
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const cert=publicKey.export({type:'spki',format:'pem'});
 mock.method(OAuth2Client.prototype,'getFederatedSignonCertsAsync',async()=>({certs:{test:cert},format:'PEM'}));
 const nonce='browser-google-nonce',now=Math.floor(Date.now()/1000);
 return {nonce,sign:overrides=>jwt.sign({iss:'https://accounts.google.com',aud:'test-client.apps.googleusercontent.com',sub:'google-'+crypto.randomUUID(),email_verified:true,given_name:'Google',family_name:'Teacher',nonce,iat:now,exp:now+3600,...claims,...overrides},privateKey,{algorithm:'RS256',keyid:'test'})};
}
check('Google accepts only the invited verified email, captures names and signs in as the invitee',async()=>{
 await require('../.test-build/middlewares/rateLimit').authLimiter.resetKey('127.0.0.1');
 const original=process.env.GOOGLE_CLIENT_ID;process.env.GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com';
 try{
  const owner=await tokens(b.ownerId,b.id),email=`google-invite-${crypto.randomUUID()}@example.test`;
  assert.equal((await request('POST','/staff',owner.accessToken,{email})).status,201);
  const token=await invitationToken(email),identity=signedGoogleIdentity({email}),sub='subject-'+crypto.randomUUID();
  const wrong=await request('POST','/auth/invitations/accept-google',owner.accessToken,{token,nonce:identity.nonce,idToken:identity.sign({email:'wrong@example.test'})});assert.equal(wrong.status,403);assert.equal(wrong.body.error.code,'INVITATION_EMAIL_MISMATCH');
  const wrongNonce=await request('POST','/auth/invitations/accept-google',undefined,{token,nonce:'different-browser-nonce',idToken:identity.sign({sub})});assert.equal(wrongNonce.status,401);
  const idToken=identity.sign({sub});const accepted=await request('POST','/auth/invitations/accept-google',owner.accessToken,{token,nonce:identity.nonce,idToken});
  assert.equal(accepted.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.data.user.email,email);assert.equal(accepted.body.data.user.firstName,'Google');assert.equal(accepted.body.data.user.lastName,'Teacher');assert.equal(accepted.body.data.orgRole,'TEACHER');
  const user=await prisma.user.findUniqueOrThrow({where:{email}});assert.equal(user.googleId,sub);assert.equal(user.passwordHash,null);
  const login=await request('POST','/auth/google',undefined,{nonce:identity.nonce,idToken});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.data.user.email,email);
  assert.equal((await request('POST','/auth/invitations/accept-google',undefined,{token,nonce:identity.nonce,idToken})).status,400);
  await prisma.membership.update({where:{userId_organizationId:{userId:user.id,organizationId:b.id}},data:{isActive:false}});
  assert.equal((await request('POST','/auth/google',undefined,{nonce:identity.nonce,idToken})).status,403);
 }finally{if(original===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=original;}
});
check('Google login cannot silently link a password account, but a matching invitation can link it without replacing its password',async()=>{
 await require('../.test-build/middlewares/rateLimit').authLimiter.resetKey('127.0.0.1');
 const original=process.env.GOOGLE_CLIENT_ID;process.env.GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com';
 try{
  const {hashPassword}=require('../.test-build/lib/password');const email=`google-existing-${crypto.randomUUID()}@example.test`;
  const user=await prisma.user.create({data:{email,firstName:'Existing',lastName:'Person',passwordHash:await hashPassword('OriginalPassword123'),memberships:{create:{organizationId:a.id,role:'TEACHER'}}}});
  const identity=signedGoogleIdentity({email}),sub='subject-'+crypto.randomUUID(),idToken=identity.sign({sub});
  const unlinked=await request('POST','/auth/google',undefined,{nonce:identity.nonce,idToken});assert.equal(unlinked.status,403);assert.equal(unlinked.body.error.code,'GOOGLE_LINK_REQUIRED');assert.equal((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).googleId,null);
  await invitationsService.create(b.id,b.ownerId,{email,firstName:'',lastName:'',role:'TEACHER'});const token=await invitationToken(email);
  const accepted=await request('POST','/auth/invitations/accept-google',undefined,{token,nonce:identity.nonce,idToken});assert.equal(accepted.status,200,JSON.stringify(accepted.body));
  const updated=await prisma.user.findUniqueOrThrow({where:{id:user.id}});assert.equal(updated.passwordHash,user.passwordHash);assert.equal(updated.googleId,sub);
  const choice=await request('POST','/auth/google',undefined,{nonce:identity.nonce,idToken});assert.equal(choice.status,409);assert.equal(choice.body.error.code,'SCHOOL_SELECTION_REQUIRED');
  const school=await prisma.organization.findUniqueOrThrow({where:{id:b.id}});
  assert.equal((await request('POST','/auth/google',undefined,{nonce:identity.nonce,idToken,schoolSlug:school.slug})).status,200);
 }finally{if(original===undefined)delete process.env.GOOGLE_CLIENT_ID;else process.env.GOOGLE_CLIENT_ID=original;}
});

check('principal academic dashboards never query or return finance data and direct finance URLs reject old tokens',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const user=await prisma.user.create({data:{email:`principal-boundary-${crypto.randomUUID()}@example.test`,firstName:'Academic',lastName:'Principal',memberships:{create:{organizationId:a.id,role:'BURSAR'}}}});
 const session=await tokens(user.id,a.id);
 await prisma.membership.update({where:{userId_organizationId:{userId:user.id,organizationId:a.id}},data:{role:'PRINCIPAL'}});
 const spy=mock.method(feesService,'bursarSummary',async()=>assert.fail('Principal dashboard must not query finance'));
 const home=await request('GET','/dashboard/home',session.accessToken);assert.equal(home.status,200,JSON.stringify(home.body));
 assert.equal(home.body.data.finance,undefined);assert.equal(home.body.data.attention.pendingPayments,undefined);assert.equal(typeof home.body.data.students,'number');assert.equal(typeof home.body.data.staff,'number');assert.ok(home.body.data.attendance);assert.equal(spy.mock.callCount(),0);
 const snapshot=await request('GET',`/dashboard/classes/${a.classId}`,session.accessToken);assert.equal(snapshot.status,200);assert.equal(snapshot.body.data.outstandingNgn,undefined);assert.equal(snapshot.body.data.invoicesWithBalance,undefined);
 for(const route of ['/fees/summary','/fees/workspace','/fees/structures','/dashboard/receipts/'+crypto.randomUUID(),'/dashboard/export?type=invoices','/dashboard/export?type=payments','/dashboard/audit-logs'])assert.equal((await request('GET',route,session.accessToken)).status,403,route);
 assert.equal((await request('GET','/dashboard/export?type=students',session.accessToken)).status,200);
 const me=await request('GET','/auth/me',session.accessToken);assert.ok(!me.body.data.permissions.includes('fees:read'));assert.ok(me.body.data.permissions.includes('exams:write'));
 const membership=await prisma.membership.findUniqueOrThrow({where:{userId_organizationId:{userId:user.id,organizationId:a.id}}});
 assert.equal((await request('PATCH',`/memberships/${membership.id}`,session.accessToken,{role:'SCHOOL_ADMIN'})).status,403);
 const {invitationsService}=require('../.test-build/features/auth/invitations.service');
 await assert.rejects(invitationsService.create(a.id,user.id,{email:'finance-escalation@example.test',firstName:'Blocked',lastName:'Role',role:'BURSAR'}),{code:'FORBIDDEN'});

});
check('home summaries return only the sections permitted to owners, bursars and exam officers',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const owner=await tokens(a.ownerId,a.id);const ownerHome=await request('GET','/dashboard/home',owner.accessToken);assert.equal(ownerHome.status,200);assert.ok(ownerHome.body.data.finance);
 const bursar=await tokens(a.bursarId,a.id);const bursarHome=await request('GET','/dashboard/home',bursar.accessToken);assert.equal(bursarHome.status,200);assert.ok(bursarHome.body.data.finance);assert.equal(bursarHome.body.data.staff,undefined);assert.equal(bursarHome.body.data.classes,undefined);assert.equal(bursarHome.body.data.attendance,undefined);assert.equal(bursarHome.body.data.attention.incompleteResults,undefined);
 const examiner=await prisma.user.create({data:{email:`academic-summary-${crypto.randomUUID()}@example.test`,firstName:'Exam',lastName:'Officer',memberships:{create:{organizationId:a.id,role:'EXAM_OFFICER'}}}});const session=await tokens(examiner.id,a.id);const summary=await request('GET','/dashboard/home',session.accessToken);assert.equal(summary.status,200);assert.equal(summary.body.data.finance,undefined);assert.equal(summary.body.data.parents,undefined);assert.equal(summary.body.data.staff,undefined);assert.equal(summary.body.data.attendance,undefined);assert.equal(typeof summary.body.data.attention.incompleteResults,'number');
});
check('read-only staff see only published announcements and cannot create, edit or delete through direct API URLs',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const reader=await prisma.user.create({data:{email:`notice-reader-${crypto.randomUUID()}@example.test`,firstName:'Reader',lastName:'Teacher',memberships:{create:{organizationId:a.id,role:'TEACHER'}}}});const session=await tokens(reader.id,a.id);
 const draft=await prisma.announcement.create({data:{organizationId:a.id,title:'Private draft',body:'Hidden management draft',isPublished:false}});
 const list=await request('GET','/communication/announcements?activeOnly=false',session.accessToken);assert.equal(list.status,200);assert.ok(!JSON.stringify(list.body).includes(draft.id));assert.ok(!JSON.stringify(list.body).includes('Hidden management draft'));
 assert.equal((await request('GET',`/communication/announcements/${draft.id}`,session.accessToken)).status,404);
 assert.equal((await request('POST','/communication/announcements',session.accessToken,{title:'Blocked notice',body:'Should never be posted'})).status,403);
 assert.equal((await request('PATCH',`/communication/announcements/${draft.id}`,session.accessToken,{title:'Changed'})).status,403);
 assert.equal((await request('DELETE',`/communication/announcements/${draft.id}`,session.accessToken)).status,403);
});


check('staff self view never exposes administrators and directory APIs reject non-managers',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const teacher=(await tokens(a.teacherId,a.id)).accessToken;
 const own=await request('GET','/staff/me?userId='+a.ownerId,teacher);
 assert.equal(own.status,200);assert.equal(own.body.data.user.id,a.teacherId);
 assert.equal(JSON.stringify(own.body).includes('owner.a@example.test'),false);
 for(const route of ['/staff','/teachers','/memberships','/memberships/invitations'])assert.equal((await request('GET',route,teacher)).status,403);
 const bursar=(await tokens(a.bursarId,a.id)).accessToken;
 assert.equal((await request('GET','/staff/me',bursar)).status,200);
 assert.equal((await request('GET','/memberships',bursar)).status,403);
 const owner=(await tokens(a.ownerId,a.id)).accessToken;
 assert.equal((await request('GET','/memberships',owner)).status,200);
});
check('account edits are self-only and password changes revoke every session',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const id=crypto.randomUUID(),email='profile-'+id+'@example.test';
 const {hashPassword,verifyPassword}=require('../.test-build/lib/password');
 await prisma.user.create({data:{id,email,firstName:'Before',lastName:'Account',passwordHash:await hashPassword('OldPassword123'),isActive:true}});
 await prisma.membership.create({data:{userId:id,organizationId:a.id,role:'TEACHER',isActive:true}});
 await prisma.membership.create({data:{userId:id,organizationId:b.id,role:'TEACHER',isActive:true}});
 const reset=await prisma.passwordResetToken.create({data:{userId:id,tokenHash:crypto.randomUUID(),expiresAt:new Date(Date.now()+60000)}});
 const first=await tokens(id,a.id),second=await tokens(id,b.id);
 const profile=await request('GET','/auth/profile',first.accessToken);
 assert.equal(profile.status,200);assert.equal(profile.body.data.hasPassword,true);assert.equal(profile.body.data.user.passwordHash,undefined);
 assert.equal((await request('PATCH','/auth/profile',first.accessToken,{firstName:'After',userId:a.ownerId})).status,422);
 assert.equal((await request('PATCH','/auth/profile',first.accessToken,{firstName:'After',avatarUrl:null})).status,200);
 assert.equal((await prisma.user.findUnique({where:{id}})).firstName,'After');
 assert.equal((await request('POST','/auth/change-password',first.accessToken,{currentPassword:'incorrect',newPassword:'NewPassword123'})).status,403);
 assert.equal((await request('POST','/auth/change-password',first.accessToken,{currentPassword:'OldPassword123',newPassword:'OldPassword123'})).status,400);
 assert.equal((await request('POST','/auth/change-password',first.accessToken,{currentPassword:'OldPassword123',newPassword:'NewPassword123'})).status,200);
 const changed=await prisma.user.findUniqueOrThrow({where:{id}});
 assert.equal(await verifyPassword('NewPassword123',changed.passwordHash),true);
 assert.equal(await verifyPassword('OldPassword123',changed.passwordHash),false);
 assert.equal(await prisma.authSession.count({where:{userId:id,revokedAt:null}}),0);
 assert.ok((await prisma.passwordResetToken.findUnique({where:{id:reset.id}})).usedAt);
 assert.equal((await request('PATCH','/auth/profile',first.accessToken,{firstName:'Stale'})).status,401);
 assert.equal((await request('GET','/auth/profile',second.accessToken)).status,401);
});
check('Google-only accounts cannot set a password without email verification',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const id=crypto.randomUUID();await prisma.user.create({data:{id,email:'google-profile-'+id+'@example.test',firstName:'Google',lastName:'Only',isActive:true}});
 await prisma.membership.create({data:{userId:id,organizationId:a.id,role:'TEACHER',isActive:true}});
 const token=(await tokens(id,a.id)).accessToken;
 const result=await request('POST','/auth/change-password',token,{currentPassword:'invented',newPassword:'NewPassword123'});
 assert.equal(result.status,400);assert.equal(result.body.error.code,'PASSWORD_NOT_SET');
 assert.equal((await prisma.user.findUnique({where:{id}})).passwordHash,null);
});

check('announcement read status is private, idempotent and limited to live notices in the current school',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const reader=(await tokens(a.teacherId,a.id)).accessToken,other=(await tokens(a.parentUserId,a.id)).accessToken;
 const create=data=>prisma.announcement.create({data:{organizationId:a.id,title:'Unread boundary test',body:'Published notice',isPublished:true,publishedAt:new Date(),...data}});
 const live=await create({}),draft=await create({isPublished:false}),expired=await create({expiresAt:new Date(Date.now()-1000)}),inactive=await create({isActive:false}),foreign=await create({organizationId:b.id});
 const before=await request('GET','/communication/announcements/unread',reader);assert.equal(before.status,200);assert.ok(before.body.data.items.some(i=>i.id===live.id));
 for(const item of [draft,expired,inactive,foreign]){assert.ok(!before.body.data.items.some(i=>i.id===item.id));assert.equal((await request('POST','/communication/announcements/'+item.id+'/read',reader,{})).status,404);}
 assert.equal((await request('POST','/communication/announcements/'+live.id+'/read',reader,{userId:a.ownerId})).status,422);
 const first=await request('POST','/communication/announcements/'+live.id+'/read',reader,{}),again=await request('POST','/communication/announcements/'+live.id+'/read',reader,{});
 assert.equal(first.status,200);assert.equal(again.body.data.readAt,first.body.data.readAt);assert.equal(await prisma.announcementRead.count({where:{announcementId:live.id,userId:a.teacherId}}),1);
 const after=await request('GET','/communication/announcements/unread',reader);assert.equal(after.body.data.count,before.body.data.count-1);assert.ok(!after.body.data.items.some(i=>i.id===live.id));
 assert.ok((await request('GET','/communication/announcements/'+live.id,reader)).body.data.readAt);
 assert.equal((await request('GET','/communication/announcements/'+live.id,other)).body.data.readAt,null);
 const listed=await request('GET','/communication/announcements?limit=100',reader);assert.ok(listed.body.data.find(i=>i.id===live.id).readAt);
 await prisma.announcement.update({where:{id:live.id},data:{isActive:false}});
 assert.equal((await request('POST','/communication/announcements/'+live.id+'/read',reader,{})).status,404);
});
check('unread count includes notices beyond its bounded preview list',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const token=(await tokens(b.teacherId,b.id)).accessToken;
 await prisma.announcement.createMany({data:Array.from({length:55},(_,i)=>({organizationId:b.id,title:'Unread '+i,body:'Notice',isPublished:true,publishedAt:new Date()}))});
 const summary=await request('GET','/communication/announcements/unread',token);assert.equal(summary.status,200);assert.ok(summary.body.data.count>=55);assert.equal(summary.body.data.items.length,20);
 assert.ok(summary.body.data.items.every(item=>item.body===undefined&&item.reads===undefined));
});


async function roleFixture(role='TEACHER'){
 const user=await prisma.user.create({data:{email:'multi-'+crypto.randomUUID()+'@example.test',firstName:'Multiple',lastName:'Duties'}});
 const membership=await prisma.membership.create({data:{organizationId:a.id,userId:user.id,role,roles:[role]}});
 const session=await tokens(user.id,a.id);return {user,membership,token:session.accessToken,refreshToken:session.refreshToken};
}
check('teacher plus exam officer keeps teaching assignments and uses live combined permissions',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const target=await roleFixture(),owner=(await tokens(a.ownerId,a.id)).accessToken;
 const schoolClass=await prisma.class.create({data:{organizationId:a.id,name:'Multi '+crypto.randomUUID(),classTeacherId:target.user.id}});
 await prisma.classSubject.create({data:{organizationId:a.id,classId:schoolClass.id,subjectId:a.subjectId}});
 await prisma.classSubjectTeacher.create({data:{organizationId:a.id,classId:schoolClass.id,subjectId:a.subjectId,userId:target.user.id}});
 const grant=await request('PATCH','/memberships/'+target.membership.id,owner,{roles:['TEACHER','EXAM_OFFICER']});assert.equal(grant.status,200,JSON.stringify(grant.body));
 const me=await request('GET','/auth/me',target.token);assert.equal(me.body.data.orgRole,'EXAM_OFFICER');assert.deepEqual(me.body.data.orgRoles,['EXAM_OFFICER','TEACHER']);assert.ok(me.body.data.permissions.includes('attendance:write'));assert.ok(me.body.data.permissions.includes('exams:write'));assert.ok(!me.body.data.permissions.includes('payments:write'));
 assert.equal((await request('GET','/exams/editor?termId='+a.termId,target.token)).status,200);
 assert.equal((await request('GET',`/results/entry-sheet?classId=${schoolClass.id}&termId=${a.termId}&subjectId=${a.subjectId}`,target.token)).status,200);
 assert.equal((await request('GET',`/results/entry-sheet?classId=${a.classId}&termId=${a.termId}&subjectId=${a.subjectId}`,target.token)).status,200);
 assert.equal((await request('POST','/results/scores/bulk',target.token,{classId:a.classId,termId:a.termId,subjectId:a.subjectId,entries:[{studentId:a.studentId,exam:40}]})).status,403);
 const pupil=await prisma.student.create({data:{organizationId:a.id,classId:schoolClass.id,admissionNumber:crypto.randomUUID(),firstName:'Role',lastName:'Student'}});
 assert.equal((await request('POST','/results/scores/bulk',target.token,{classId:schoolClass.id,termId:a.termId,subjectId:a.subjectId,entries:[{studentId:pupil.id,ca1:10,ca2:10,exam:40}]})).status,200);
 const refreshed=await authSessions.refresh(target.refreshToken);assert.ok(refreshed.orgRoles.includes('TEACHER'));assert.ok(refreshed.orgRoles.includes('EXAM_OFFICER'));
 assert.equal((await request('GET','/attendance/class?classId='+a.classId+'&date=2026-11-10',target.token)).status,403);
 assert.equal((await request('GET','/attendance/class?classId='+schoolClass.id+'&date=2026-11-10',target.token)).status,200);
 const {assertClassTeacher}=require('../.test-build/auth/resourceAccess');await assertClassTeacher(a.id,target.user.id,schoolClass.id);await assert.rejects(assertClassTeacher(a.id,target.user.id,a.classId),{statusCode:403});
 assert.equal((await request('GET','/staff',target.token)).status,403);
 assert.equal((await request('GET','/teachers/'+target.user.id,owner)).status,200);
 assert.ok((await request('GET','/teachers?role=TEACHER',owner)).body.data.items.some(item=>item.id===target.user.id));
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,owner,{roles:['TEACHER']})).status,200);
 assert.equal((await request('GET','/exams/editor?termId='+a.termId,target.token)).status,403);
 const reduced=await authSessions.refresh(refreshed.refreshToken);assert.deepEqual(reduced.orgRoles,['TEACHER']);
 assert.equal(await prisma.classSubjectTeacher.count({where:{organizationId:a.id,userId:target.user.id}}),1);
 assert.equal((await prisma.class.findUnique({where:{id:schoolClass.id}})).classTeacherId,target.user.id);
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,owner,{roles:['STAFF']})).status,200);
 assert.equal(await prisma.classSubjectTeacher.count({where:{organizationId:a.id,userId:target.user.id}}),0);
 assert.equal((await prisma.class.findUnique({where:{id:schoolClass.id}})).classTeacherId,null);
});
check('role sets preserve owner and principal boundaries and reject cross-portal mixing',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const owner=(await tokens(a.ownerId,a.id)).accessToken,principal=await roleFixture('PRINCIPAL'),target=await roleFixture();
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,principal.token,{roles:['TEACHER','EXAM_OFFICER']})).status,200);
 for(const extra of ['PROPRIETOR','SCHOOL_ADMIN','BURSAR'])assert.equal((await request('PATCH','/memberships/'+target.membership.id,principal.token,{roles:['TEACHER',extra]})).status,403);
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,owner,{roles:['TEACHER','PARENT']})).status,400);
 const ownerMember=await prisma.membership.findUnique({where:{userId_organizationId:{userId:a.ownerId,organizationId:a.id}}});
 assert.equal((await request('PATCH','/memberships/'+ownerMember.id,owner,{roles:['TEACHER']})).status,400);
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,owner,{roles:['TEACHER','BURSAR']})).status,200);
 assert.equal((await request('PATCH','/memberships/'+target.membership.id,principal.token,{roles:['TEACHER']})).status,403);
 assert.equal((await request('PATCH','/teachers/'+target.user.id,principal.token,{isActive:false})).status,403);
 assert.equal((await request('GET','/results/'+a.publishedResultId,target.token)).status,404);
 const me=await request('GET','/auth/me',target.token);assert.ok(me.body.data.permissions.includes('payments:write'));assert.ok(me.body.data.permissions.includes('results:write'));
 const foreign=await prisma.membership.findUnique({where:{userId_organizationId:{userId:b.teacherId,organizationId:b.id}}});assert.equal((await request('PATCH','/memberships/'+foreign.id,owner,{roles:['TEACHER','EXAM_OFFICER']})).status,404);
});

check('a financial role plus exam officer can save and publish timetables with live transaction permissions',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const f=await examFixture(),owner=(await tokens(a.ownerId,a.id)).accessToken;
 const member=await prisma.membership.findUnique({where:{userId_organizationId:{userId:f.officer.id,organizationId:a.id}}});
 assert.equal((await request('PATCH','/memberships/'+member.id,owner,{roles:['BURSAR','EXAM_OFFICER']})).status,200);
 const body={termId:f.term.id,expectedVersion:0,title:'Combined duties exam',entries:f.entries};
 const saved=await request('PUT','/exams/timetable',f.officerToken,body);assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal((await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:1})).status,200);
 assert.equal((await request('PATCH','/memberships/'+member.id,owner,{roles:['BURSAR']})).status,200);
 assert.equal((await request('PUT','/exams/timetable',f.officerToken,{...body,expectedVersion:2})).status,403);
 const {saveExamTimetable}=require('../.test-build/features/exams/exams.service');await assert.rejects(saveExamTimetable(a.id,f.officer.id,{...body,expectedVersion:2}),{code:'FORBIDDEN'});
});

check('exam and test plans are separate and published formats remain immutable until republished',async()=>{
 await require('../.test-build/middlewares/rateLimit').apiLimiter.resetKey('127.0.0.1');
 const f=await examFixture(),format={startDate:'2026-11-10',startTime:'08:00',papersPerDay:3,paperMinutes:120,breakAfter:1,breakMinutes:30,weekdays:[1,2,3,4,5]},entries=f.entries.map(entry=>({...entry,startTime:'08:00',endTime:'10:00'}));
 const body={kind:'EXAM',termId:f.term.id,expectedVersion:0,title:'Term exams',format,entries};
 let response=await request('PUT','/exams/timetable',f.officerToken,body);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.format.papersPerDay,3);
 const testBody={...body,kind:'TEST',title:'Term tests',format:{...format,paperMinutes:60},entries:entries.map(entry=>({...entry,endTime:'09:00'}))};assert.equal((await request('PUT','/exams/timetable',f.officerToken,testBody)).status,200);
 assert.equal(await prisma.examTimetable.count({where:{organizationId:a.id,termId:f.term.id}}),2);
 assert.equal((await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,kind:'EXAM',expectedVersion:1})).status,200);
 let published=await request('GET','/exams/published?termId='+f.term.id+'&kind=EXAM',f.parentToken);assert.equal(published.status,400);
 published=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id+'&kind=EXAM',f.parentToken);assert.equal(published.status,200);assert.equal(published.body.data.format.paperMinutes,120);assert.equal(published.body.data.entries.length,1);
 const tests=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id+'&kind=TEST',f.parentToken);assert.equal(tests.body.data.publishedAt,null);assert.equal(tests.body.data.entries.length,0);
 const edited={...body,expectedVersion:2,format:{...format,paperMinutes:90},entries:entries.map(entry=>({...entry,endTime:'09:30'}))};assert.equal((await request('PUT','/exams/timetable',f.officerToken,edited)).status,200);
 published=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(published.body.data.format.paperMinutes,120);assert.equal(published.body.data.entries[0].endTime,'10:00');
 assert.equal((await request('POST','/exams/timetable/publish',f.officerToken,{termId:f.term.id,expectedVersion:3})).status,200);
 published=await request('GET','/exams/published?termId='+f.term.id+'&studentId='+f.children[0].id,f.parentToken);assert.equal(published.body.data.format.paperMinutes,90);
 const bad={...edited,expectedVersion:4,entries:[{...edited.entries[0],startTime:'09:30',endTime:'10:00'}]};response=await request('PUT','/exams/timetable',f.officerToken,bad);assert.equal(response.status,400);assert.equal(response.body.error.code,'TIMETABLE_FORMAT_MISMATCH');
 const testEditor=await request('GET','/exams/editor?termId='+f.term.id+'&kind=TEST',f.officerToken);assert.equal(testEditor.body.data.timetable.version,1);
 assert.equal((await request('GET','/exams/editor?termId='+f.term.id+'&kind=UNKNOWN',f.officerToken)).status,422);
});
