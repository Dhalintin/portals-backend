"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankConfirmSchema = exports.bankRequestSchema = exports.bankDetailsSchema = void 0;
exports.readBankAccount = readBankAccount;
exports.requestBankChange = requestBankChange;
exports.confirmBankChange = confirmBankChange;
exports.bankTransferInstructions = bankTransferInstructions;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
const env_1 = require("../../config/env");
const password_1 = require("../../lib/password");
const authEmail_1 = require("../../lib/authEmail");
exports.bankDetailsSchema = zod_1.z.object({ bankName: zod_1.z.string().trim().min(2).max(100), accountName: zod_1.z.string().trim().min(2).max(150), accountNumber: zod_1.z.string().regex(/^\d{10}$/, 'Enter a 10-digit Nigerian account number.') }).strict();
exports.bankRequestSchema = exports.bankDetailsSchema.extend({ password: zod_1.z.string().min(1).max(200) }).strict();
exports.bankConfirmSchema = zod_1.z.object({ changeId: zod_1.z.string().uuid(), code: zod_1.z.string().regex(/^\d{6}$/) }).strict();
const digest = (id, code) => (0, crypto_1.createHmac)('sha256', env_1.env.JWT_ACCESS_SECRET).update(id + ':' + code).digest('hex');
async function owner(auth) { if (auth.orgRole !== 'PROPRIETOR' || !auth.schoolId)
    throw new errors_1.AppError(403, 'OWNER_ONLY', 'Only the school creator can change bank details.'); const school = await prisma_1.prisma.organization.findFirst({ where: { id: auth.schoolId, createdById: auth.userId, isActive: true } }); if (!school)
    throw new errors_1.AppError(403, 'OWNER_ONLY', 'Only the school creator can manage bank details.'); return school; }
async function readBankAccount(auth) { await owner(auth); const row = await prisma_1.prisma.schoolBankAccount.findUnique({ where: { organizationId: auth.schoolId } }); return row ? { ...exports.bankDetailsSchema.parse(JSON.parse((0, authEmail_1.decryptAuthEmail)(row.encryptedDetails))), updatedAt: row.updatedAt, version: row.version } : null; }
async function requestBankChange(auth, raw) {
    const school = await owner(auth), input = exports.bankRequestSchema.parse(raw);
    const user = await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.isActive || !await (0, password_1.verifyPassword)(input.password, user.passwordHash))
        throw new errors_1.AppError(403, 'REAUTHENTICATION_FAILED', 'Your current password is incorrect.');
    (0, authEmail_1.assertAuthEmailDeliveryConfigured)();
    const details = exports.bankDetailsSchema.parse({ bankName: input.bankName, accountName: input.accountName, accountNumber: input.accountNumber }), id = (0, crypto_1.randomUUID)(), code = String((0, crypto_1.randomInt)(100000, 1000000)), expiresAt = new Date(Date.now() + 10 * 60_000);
    return (0, schoolTransaction_1.schoolTransaction)(school.id, async (tx) => {
        const existing = await tx.schoolBankAccount.findUnique({ where: { organizationId: school.id } });
        if (existing && existing.updatedAt.getTime() > Date.now() - 86400000)
            throw new errors_1.AppError(429, 'BANK_CHANGE_COOLDOWN', 'Bank details can be changed once every 24 hours.');
        const recent = await tx.bankAccountChange.findFirst({ where: { organizationId: school.id }, orderBy: { createdAt: 'desc' } });
        if (recent && recent.createdAt.getTime() > Date.now() - 60_000)
            throw new errors_1.AppError(429, 'OTP_COOLDOWN', 'Wait one minute before requesting another code.');
        if (await tx.bankAccountChange.count({ where: { organizationId: school.id, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 5)
            throw new errors_1.AppError(429, 'OTP_LIMIT', 'Too many verification requests. Try again in an hour.');
        await tx.bankAccountChange.updateMany({ where: { organizationId: school.id, usedAt: null }, data: { usedAt: new Date() } });
        await tx.bankAccountChange.create({ data: { id, organizationId: school.id, requesterId: auth.userId, email: user.email, encryptedDetails: (0, authEmail_1.encryptAuthEmail)(JSON.stringify(details)), codeHash: digest(id, code), expectedVersion: existing?.version ?? 0, expiresAt } });
        await (0, authEmail_1.enqueueAuthEmail)(tx, user.email, school.name + ': verify bank account change', 'Your verification code is ' + code + '. It expires in 10 minutes.\n\nProposed account: ' + details.bankName + ' — ' + details.accountName + ' — ' + details.accountNumber + '.\n\nDo not share this code. If you did not request this, do not approve the change and secure your account.', expiresAt);
        await tx.auditLog.create({ data: { organizationId: school.id, actorId: auth.userId, action: 'SETTINGS_CHANGED', entity: 'SchoolBankAccount', entityId: school.id, metadata: { operation: 'BANK_CHANGE_REQUESTED', changeId: id, last4: details.accountNumber.slice(-4) } } });
        const [local, domain] = user.email.split('@');
        return { changeId: id, expiresAt, emailHint: local.slice(0, 2) + '***@' + domain, details };
    });
}
async function confirmBankChange(auth, raw) {
    const school = await owner(auth), input = exports.bankConfirmSchema.parse(raw);
    const result = await (0, schoolTransaction_1.schoolTransaction)(school.id, async (tx) => {
        const change = await tx.bankAccountChange.findFirst({ where: { id: input.changeId, organizationId: school.id, requesterId: auth.userId } });
        if (!change || change.usedAt || change.expiresAt.getTime() <= Date.now() || change.attempts >= 5)
            return { error: 'The code expired or is no longer valid. Request a new code.' };
        const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
        const bank = await tx.schoolBankAccount.findUnique({ where: { organizationId: school.id } });
        if (user.email !== change.email || (bank?.version ?? 0) !== change.expectedVersion)
            return { error: 'Account details changed during verification. Request a new code.' };
        const expected = Buffer.from(change.codeHash, 'hex'), actual = Buffer.from(digest(change.id, input.code), 'hex');
        if (!(0, crypto_1.timingSafeEqual)(expected, actual)) {
            await tx.bankAccountChange.update({ where: { id: change.id }, data: { attempts: { increment: 1 } } });
            await tx.auditLog.create({ data: { organizationId: school.id, actorId: auth.userId, action: 'SETTINGS_CHANGED', entity: 'SchoolBankAccount', entityId: school.id, metadata: { operation: 'BANK_OTP_REJECTED', changeId: change.id } } });
            return { error: 'Incorrect code. You have ' + (4 - change.attempts) + ' attempts remaining.' };
        }
        if (bank && bank.updatedAt.getTime() > Date.now() - 86400000)
            return { error: 'Bank details were changed recently. Wait 24 hours.' };
        const details = exports.bankDetailsSchema.parse(JSON.parse((0, authEmail_1.decryptAuthEmail)(change.encryptedDetails)));
        await tx.schoolBankAccount.upsert({ where: { organizationId: school.id }, create: { organizationId: school.id, encryptedDetails: change.encryptedDetails }, update: { encryptedDetails: change.encryptedDetails, version: { increment: 1 } } });
        await tx.bankAccountChange.update({ where: { id: change.id }, data: { usedAt: new Date(), codeHash: '' } });
        await tx.auditLog.create({ data: { organizationId: school.id, actorId: auth.userId, action: 'SETTINGS_CHANGED', entity: 'SchoolBankAccount', entityId: school.id, metadata: { operation: 'BANK_ACCOUNT_CHANGED', version: change.expectedVersion + 1, last4: details.accountNumber.slice(-4) } } });
        const recipients = new Set([user.email, change.email]);
        for (const recipient of recipients)
            await (0, authEmail_1.enqueueAuthEmail)(tx, recipient, school.name + ': bank account updated', 'Your school bank account was updated to ' + details.bankName + ', ending ' + details.accountNumber.slice(-4) + '. If you did not approve this change, contact your school and secure your account immediately.', new Date(Date.now() + 86400000));
        return { details };
    });
    if (result.error)
        throw new errors_1.AppError(400, 'INVALID_OTP', result.error);
    return result.details;
}
async function bankTransferInstructions(organizationId) { const account = await prisma_1.prisma.schoolBankAccount.findUnique({ where: { organizationId } }); return account ? exports.bankDetailsSchema.parse(JSON.parse((0, authEmail_1.decryptAuthEmail)(account.encryptedDetails))) : null; }
