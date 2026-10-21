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
  const term = await academicService.createTerm(a.id, session.id, { name: 'FIRST', isCurrent: true });
  let current = await academicService.getCurrent(a.id);
  assert.equal(current.session.id, session.id); assert.equal(current.term.id, term.id);
  await academicService.updateTerm(a.id, a.sessionId, a.secondTermId, { isCurrent: true });
  current = await academicService.getCurrent(a.id);
  assert.equal(current.session.id, a.sessionId); assert.equal(current.term.id, a.secondTermId);
  assert.equal(await prisma.term.count({ where: { session: { organizationId: a.id }, isCurrent: true } }), 1);
});

check('concurrent term selection leaves exactly one current term in the current session', async () => {
  const session = await academicService.createSession(a.id, { name: '2030/2031', isCurrent: false });
  const term = await academicService.createTerm(a.id, session.id, { name: 'FIRST', isCurrent: false });
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
    for (const row of hidden) assert.equal((await request('GET', `/communication/announcements/${row.id}`, token)).body.data, null);
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
  const term = await call('POST', `/academic/sessions/${session.id}/terms`, token, { name: 'FIRST', isCurrent: true });
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
