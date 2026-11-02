"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentParentReviews = exports.studentPortal = exports.studentLoginSchema = void 0;
exports.studentLogin = studentLogin;
exports.ownStudent = ownStudent;
exports.manageStudentAccount = manageStudentAccount;
const auth_validation_1 = require("../auth/auth.validation");
const express_1 = require("express");
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const password_1 = require("../../lib/password");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const auth_sessions_1 = require("../auth/auth.sessions");
const fees_service_1 = require("../fees/fees.service");
const results_service_1 = require("../results/results.service");
const requirePermission_1 = require("../../middlewares/requirePermission");
const rateLimit_1 = require("../../middlewares/rateLimit");
const http_1 = require("../../lib/http");
exports.studentLoginSchema = zod_1.z.object({ admissionNumber: zod_1.z.string().trim().min(1).max(100), password: zod_1.z.string().min(1).max(128), schoolSlug: zod_1.z.string().trim().max(80).optional(), activationCode: zod_1.z.string().trim().min(16).max(100).optional() }).strict();
async function studentLogin(raw) {
    const input = exports.studentLoginSchema.parse(raw);
    if (input.activationCode)
        return activateStudent(input);
    const candidates = await prisma_1.prisma.student.findMany({ where: { admissionNumber: { equals: input.admissionNumber, mode: 'insensitive' }, isActive: true, portalEnabled: true, organization: { isActive: true, ...(input.schoolSlug ? { slug: input.schoolSlug } : {}) }, user: { isActive: true, memberships: { some: { isActive: true, role: 'STUDENT' } } } }, include: { user: true, organization: { select: { id: true, name: true, slug: true } } }, take: 51 });
    if (candidates.length > 50)
        throw new errors_1.AppError(400, 'SCHOOL_LINK_REQUIRED', 'Open the student sign-in link provided by your school.');
    const matching = [];
    for (const student of candidates)
        if (await (0, password_1.verifyPassword)(input.password, student.user?.passwordHash))
            matching.push(student);
    if (!matching.length)
        throw new errors_1.AppError(401, 'INVALID_CREDENTIALS', 'Admission number or password is incorrect. Check your school sign-in link.');
    if (matching.length > 1)
        throw new errors_1.AppError(409, 'SCHOOL_SELECTION_REQUIRED', 'Choose your school to continue.', { schools: matching.map(student => student.organization) });
    const student = matching[0], member = await prisma_1.prisma.membership.findFirst({ where: { organizationId: student.organizationId, userId: student.userId, isActive: true, role: 'STUDENT' } });
    if (!member || !student.user)
        throw new errors_1.AppError(401, 'INVALID_CREDENTIALS', 'Student access is not enabled. Contact the school office.');
    return auth_sessions_1.authSessions.create(student.user.id, student.organizationId, student.user.authVersion);
}
async function activateStudent(input) {
    auth_validation_1.passwordSchema.parse(input.password);
    const digest = (0, crypto_1.createHash)('sha256').update(input.activationCode).digest('hex');
    const candidate = await prisma_1.prisma.student.findFirst({ where: { activationCodeHash: digest, activationCodeExpiresAt: { gt: new Date() }, portalEnabled: true, isActive: true, admissionNumber: { equals: input.admissionNumber, mode: 'insensitive' }, organization: { isActive: true, ...(input.schoolSlug ? { slug: input.schoolSlug } : {}) } }, select: { id: true, organizationId: true } });
    if (!candidate)
        throw new errors_1.AppError(400, 'INVALID_ACTIVATION', 'The activation code or admission number is incorrect, expired or already used. Ask the school for a new code.');
    const passwordHash = await (0, password_1.hashPassword)(input.password);
    const user = await (0, schoolTransaction_1.schoolTransaction)(candidate.organizationId, async (tx) => {
        const claimed = await tx.student.updateMany({ where: { id: candidate.id, organizationId: candidate.organizationId, isActive: true, portalEnabled: true, activationCodeHash: digest, activationCodeExpiresAt: { gt: new Date() }, userId: null }, data: { activationCodeHash: null, activationCodeExpiresAt: null } });
        if (claimed.count !== 1)
            throw new errors_1.AppError(409, 'ACTIVATION_USED', 'This activation code is no longer available. Sign in or ask your school to reset your password.');
        const student = await tx.student.findUniqueOrThrow({ where: { id: candidate.id } });
        const user = await tx.user.create({ data: { email: 'student.' + student.id + '@accounts.schoolos.invalid', firstName: student.firstName, lastName: student.lastName, passwordHash } });
        await tx.membership.create({ data: { userId: user.id, organizationId: student.organizationId, role: 'STUDENT', roles: ['STUDENT'] } });
        await tx.student.update({ where: { id: student.id }, data: { userId: user.id, portalEnabled: true, activationCodeHash: null, activationCodeExpiresAt: null } });
        await tx.auditLog.create({ data: { organizationId: student.organizationId, actorId: user.id, action: 'SETTINGS_CHANGED', entity: 'Student', entityId: student.id, metadata: { operation: 'STUDENT_ACTIVATED' } } });
        return user;
    });
    return auth_sessions_1.authSessions.create(user.id, candidate.organizationId, user.authVersion);
}
async function ownStudent(auth) {
    if (auth.orgRole !== 'STUDENT')
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Student account required');
    const student = await prisma_1.prisma.student.findFirst({ where: { organizationId: auth.schoolId, userId: auth.userId, isActive: true, portalEnabled: true }, include: { class: { select: { name: true, arm: true } }, organization: { select: { name: true, slug: true, logoUrl: true } } } });
    if (!student)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Student record not found');
    return student;
}
async function manageStudentAccount(organizationId, studentId, actorId, raw) {
    const { action } = zod_1.z.object({ action: zod_1.z.enum(['activation', 'enable', 'reset', 'disable']) }).strict().parse(raw);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const student = await tx.student.findFirst({ where: { id: studentId, organizationId }, include: { organization: { select: { slug: true } }, user: true } });
        if (!student)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Student not found');
        if (!student.isActive && action !== 'disable')
            throw new errors_1.AppError(400, 'INACTIVE_STUDENT', 'Activate the student record first');
        if (action === 'activation') {
            if (student.userId)
                throw new errors_1.AppError(409, 'ACCOUNT_EXISTS', 'This student already has an account. Use Reset password instead.');
            const activationCode = (0, crypto_1.randomBytes)(18).toString('base64url'), expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await tx.student.update({ where: { id: student.id }, data: { portalEnabled: true, activationCodeHash: (0, crypto_1.createHash)('sha256').update(activationCode).digest('hex'), activationCodeExpiresAt: expiresAt } });
            await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'Student', entityId: student.id, metadata: { operation: 'STUDENT_ACTIVATION_ISSUED' } } });
            return { enabled: true, admissionNumber: student.admissionNumber, schoolSlug: student.organization.slug, activationCode, expiresAt };
        }
        if (action === 'disable') {
            await tx.student.update({ where: { id: student.id }, data: { portalEnabled: false, activationCodeHash: null, activationCodeExpiresAt: null } });
            if (student.userId) {
                await tx.user.update({ where: { id: student.userId }, data: { isActive: false, authVersion: { increment: 1 } } });
                await tx.membership.updateMany({ where: { organizationId, userId: student.userId, role: 'STUDENT' }, data: { isActive: false } });
                await tx.authSession.updateMany({ where: { userId: student.userId, revokedAt: null }, data: { revokedAt: new Date() } });
            }
            await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'Student', entityId: student.id, metadata: { operation: 'STUDENT_LOGIN_DISABLED' } } });
            return { enabled: false, admissionNumber: student.admissionNumber, schoolSlug: student.organization.slug };
        }
        if (student.portalEnabled && student.user && action === 'enable' && student.user.isActive) {
            const membership = await tx.membership.findUnique({ where: { userId_organizationId: { userId: student.user.id, organizationId } } });
            if (membership?.isActive && membership.role === 'STUDENT')
                return { enabled: true, admissionNumber: student.admissionNumber, schoolSlug: student.organization.slug };
        }
        const temporaryPassword = (0, crypto_1.randomBytes)(15).toString('base64url') + 'a1', passwordHash = await (0, password_1.hashPassword)(temporaryPassword);
        const user = student.userId ? await tx.user.update({ where: { id: student.userId }, data: { passwordHash, isActive: true, authVersion: { increment: 1 } } }) : await tx.user.create({ data: { email: 'student.' + student.id + '@accounts.schoolos.invalid', firstName: student.firstName, lastName: student.lastName, passwordHash } });
        await tx.membership.upsert({ where: { userId_organizationId: { userId: user.id, organizationId } }, create: { userId: user.id, organizationId, role: 'STUDENT', roles: ['STUDENT'] }, update: { role: 'STUDENT', roles: ['STUDENT'], isActive: true } });
        await tx.student.update({ where: { id: student.id }, data: { userId: user.id, portalEnabled: true, activationCodeHash: null, activationCodeExpiresAt: null } });
        await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'Student', entityId: student.id, metadata: { operation: action === 'reset' ? 'STUDENT_PASSWORD_RESET' : 'STUDENT_LOGIN_ENABLED' } } });
        return { enabled: true, admissionNumber: student.admissionNumber, schoolSlug: student.organization.slug, temporaryPassword };
    });
}
exports.studentPortal = (0, express_1.Router)();
exports.studentPortal.get('/me', async (req, res, next) => { try {
    const s = await ownStudent(req.auth);
    (0, http_1.sendSuccess)(res, { id: s.id, firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber, contactEmail: s.contactEmail, class: s.class, school: s.organization });
}
catch (e) {
    next(e);
} });
exports.studentPortal.patch('/me', async (req, res, next) => { try {
    const s = await ownStudent(req.auth), input = zod_1.z.object({ contactEmail: zod_1.z.string().trim().email().max(320).transform(v => v.toLowerCase()) }).strict().parse(req.body);
    (0, http_1.sendSuccess)(res, await prisma_1.prisma.student.update({ where: { id: s.id }, data: input, select: { id: true, contactEmail: true } }));
}
catch (e) {
    next(e);
} });
exports.studentPortal.get('/fees', async (req, res, next) => { try {
    const s = await ownStudent(req.auth);
    (0, http_1.sendSuccess)(res, await fees_service_1.feesService.familyFees(s.organizationId, req.auth.userId, [s.id]));
}
catch (e) {
    next(e);
} });
exports.studentPortal.get('/results', async (req, res, next) => { try {
    const s = await ownStudent(req.auth);
    (0, http_1.sendSuccess)(res, await prisma_1.prisma.result.findMany({ where: { organizationId: s.organizationId, studentId: s.id, isPublished: true, status: 'PUBLISHED' }, include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } }, term: { select: { id: true, name: true, markingScheme: true, session: { select: { name: true } } } }, class: { select: { id: true, name: true, arm: true } }, scores: { include: { subject: { select: { name: true, code: true } } } } }, orderBy: { publishedAt: 'desc' } }));
}
catch (e) {
    next(e);
} });
exports.studentPortal.get('/results/:id/report-card', async (req, res, next) => { try {
    const s = await ownStudent(req.auth), id = zod_1.z.string().uuid().parse(req.params.id);
    const visible = await prisma_1.prisma.result.findFirst({ where: { id, organizationId: s.organizationId, studentId: s.id, isPublished: true, status: 'PUBLISHED' }, select: { id: true } });
    if (!visible)
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Published result not found');
    const report = await results_service_1.resultsService.reportCardPayload(s.organizationId, id);
    if (!report.result.isPublished || report.result.status !== 'PUBLISHED')
        throw new errors_1.AppError(404, 'NOT_FOUND', 'Published result not found');
    (0, http_1.sendSuccess)(res, report);
}
catch (e) {
    next(e);
} });
exports.studentPortal.get('/parent-requests', async (req, res, next) => { try {
    const s = await ownStudent(req.auth);
    (0, http_1.sendSuccess)(res, { items: await prisma_1.prisma.studentParentRequest.findMany({ where: { studentId: s.id, organizationId: s.organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}
catch (e) {
    next(e);
} });
exports.studentPortal.post('/parent-requests', rateLimit_1.invitationLimiter, async (req, res, next) => { try {
    const s = await ownStudent(req.auth), { email } = zod_1.z.object({ email: zod_1.z.string().trim().email().max(320).transform(v => v.toLowerCase()) }).strict().parse(req.body);
    (0, http_1.sendSuccess)(res, await prisma_1.prisma.studentParentRequest.upsert({ where: { studentId_email: { studentId: s.id, email } }, create: { organizationId: s.organizationId, studentId: s.id, email }, update: {} }), 201);
}
catch (e) {
    next(e);
} });
exports.studentParentReviews = (0, express_1.Router)();
exports.studentParentReviews.get('/student-parent-requests', (0, requirePermission_1.requirePermission)('parents:write'), async (req, res, next) => { try {
    const page = zod_1.z.coerce.number().int().min(1).parse(req.query.page ?? 1), where = { organizationId: req.auth.schoolId, status: 'PENDING', student: { isActive: true } };
    const [items, total] = await Promise.all([prisma_1.prisma.studentParentRequest.findMany({ where, include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } }, orderBy: { createdAt: 'asc' }, take: 25, skip: (page - 1) * 25 }), prisma_1.prisma.studentParentRequest.count({ where })]);
    (0, http_1.sendSuccess)(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / 25)) });
}
catch (e) {
    next(e);
} });
exports.studentParentReviews.post('/student-parent-requests/:id/review', (0, requirePermission_1.requirePermission)('parents:write'), async (req, res, next) => {
    try {
        const id = zod_1.z.string().uuid().parse(req.params.id), input = zod_1.z.discriminatedUnion('decision', [zod_1.z.object({ decision: zod_1.z.literal('APPROVED'), firstName: zod_1.z.string().trim().min(1).max(80), lastName: zod_1.z.string().trim().min(1).max(80) }), zod_1.z.object({ decision: zod_1.z.literal('DECLINED'), reviewNote: zod_1.z.string().trim().min(3).max(500) })]).parse(req.body), organizationId = req.auth.schoolId;
        const result = await (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const request = await tx.studentParentRequest.findFirst({ where: { id, organizationId, student: { organizationId, isActive: true } } });
            if (!request)
                throw new errors_1.AppError(404, 'NOT_FOUND', 'Parent request not found');
            if (request.status !== 'PENDING')
                throw new errors_1.AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed');
            let parentId;
            if (input.decision === 'APPROVED') {
                const matches = await tx.parent.findMany({ where: { organizationId, email: { equals: request.email, mode: 'insensitive' }, isActive: true }, take: 2 });
                if (matches.length > 1)
                    throw new errors_1.AppError(409, 'DUPLICATE_PARENTS', 'More than one parent has this email. Resolve the duplicate parent records first.');
                const parent = matches[0] ?? await tx.parent.create({ data: { organizationId, email: request.email, firstName: input.firstName, lastName: input.lastName } });
                parentId = parent.id;
                await tx.parentStudent.upsert({ where: { parentId_studentId: { parentId: parent.id, studentId: request.studentId } }, create: { organizationId, parentId: parent.id, studentId: request.studentId, isPrimary: false }, update: {} });
            }
            await tx.studentParentRequest.update({ where: { id }, data: { status: input.decision, reviewNote: input.decision === 'DECLINED' ? input.reviewNote : null, reviewerId: req.auth.userId, reviewedAt: new Date() } });
            await tx.auditLog.create({ data: { organizationId, actorId: req.auth.userId, action: 'SETTINGS_CHANGED', entity: 'StudentParentRequest', entityId: id, metadata: { decision: input.decision, studentId: request.studentId } } });
            return { id, status: input.decision, parentId };
        });
        (0, http_1.sendSuccess)(res, result);
    }
    catch (e) {
        next(e);
    }
});
