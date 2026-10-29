"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingStaffRoleSchema = exports.staffImportSchema = void 0;
exports.importStaff = importStaff;
exports.updatePendingStaffRole = updatePendingStaffRole;
const rbac_1 = require("../../auth/rbac");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
const token_1 = require("../../lib/token");
const authEmail_1 = require("../../lib/authEmail");
const rowSchema = zod_1.z.object({ rowNumber: zod_1.z.number().int().positive(), firstName: zod_1.z.string().trim().max(80).default(''), lastName: zod_1.z.string().trim().max(80).default(''), email: zod_1.z.string().trim().toLowerCase().email().max(254) }).strict();
exports.staffImportSchema = zod_1.z.object({ dryRun: zod_1.z.boolean().default(true), idempotencyKey: zod_1.z.string().uuid().optional(), defaultRole: zod_1.z.enum(['TEACHER', 'STAFF']).default('TEACHER'), rows: zod_1.z.array(zod_1.z.unknown()).min(1).max(100) }).strict().superRefine((input, ctx) => { if (!input.dryRun && !input.idempotencyKey)
    ctx.addIssue({ code: 'custom', path: ['idempotencyKey'], message: 'Import retry key is required' }); });
async function importStaff(organizationId, actorId, raw) {
    const input = exports.staffImportSchema.parse(raw), errors = [], rows = [], emails = new Set(), numbers = new Set();
    input.rows.forEach((row, index) => { const parsed = rowSchema.safeParse(row); if (!parsed.success) {
        errors.push({ rowNumber: index + 2, message: parsed.error.issues.map(e => e.path.join('.') + ': ' + e.message).join('; ') });
        return;
    } if (emails.has(parsed.data.email) || numbers.has(parsed.data.rowNumber)) {
        errors.push({ rowNumber: parsed.data.rowNumber, message: 'Duplicate email or row number in this file' });
        return;
    } emails.add(parsed.data.email); numbers.add(parsed.data.rowNumber); rows.push(parsed.data); });
    const requestHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify({ defaultRole: input.defaultRole, rows: [...rows].sort((a, b) => a.rowNumber - b.rowNumber) })).digest('hex');
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const actor = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true } } });
        if (!actor || !['PROPRIETOR', 'PRINCIPAL', 'SCHOOL_ADMIN'].includes((0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(actor))))
            throw new errors_1.AppError(403, 'FORBIDDEN', 'Staff management permission required');
        if (!input.dryRun) {
            if (errors.length)
                throw new errors_1.AppError(400, 'IMPORT_HAS_ERRORS', 'Fix the spreadsheet errors before importing', { errors });
            const previous = await tx.importBatch.findUnique({ where: { organizationId_kind_idempotencyKey: { organizationId, kind: 'STAFF_INVITATIONS', idempotencyKey: input.idempotencyKey } } });
            if (previous) {
                if (previous.requestHash !== requestHash)
                    throw new errors_1.AppError(409, 'IDEMPOTENCY_CONFLICT', 'This retry key belongs to different rows');
                return { ...previous.result, replayed: true };
            }
        }
        const existing = await tx.membership.findMany({ where: { organizationId, user: { email: { in: [...emails] } } }, select: { user: { select: { email: true } } } });
        const invitations = await tx.schoolInvitation.findMany({ where: { organizationId, email: { in: [...emails] }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true } });
        const duplicates = new Set([...existing.map(m => m.user.email.toLowerCase()), ...invitations.map(i => i.email.toLowerCase())]);
        for (const row of rows)
            if (duplicates.has(row.email))
                errors.push({ rowNumber: row.rowNumber, message: 'This email already has a school membership or pending invitation' });
        if (input.dryRun)
            return { dryRun: true, validCount: input.rows.length - errors.length, errorCount: errors.length, errors, canCommit: errors.length === 0, defaultRole: input.defaultRole };
        if (errors.length)
            throw new errors_1.AppError(400, 'IMPORT_HAS_ERRORS', 'Fix the spreadsheet errors before importing', { errors });
        const school = await tx.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { name: true } });
        if (!school)
            throw new errors_1.AppError(404, 'NOT_FOUND', 'School not found');
        const expiresAt = new Date(Date.now() + 48 * 3600000);
        const prepared = rows.map(row => { const token = (0, token_1.randomToken)(32); return { row, id: (0, node_crypto_1.randomUUID)(), tokenHash: (0, token_1.sha256)(token), encryptedText: (0, authEmail_1.encryptAuthEmail)(`You have been invited to ${school.name}.\nAccept within 48 hours: ${(0, authEmail_1.authLink)('/accept-invitation', token)}\nOpen the link and join with Google or a password using this invited email. If you already have a password, use that password.`) }; });
        await tx.schoolInvitation.createMany({ data: prepared.map(({ row, id, tokenHash }) => ({ id, organizationId, invitedById: actorId, firstName: row.firstName, lastName: row.lastName, email: row.email, role: input.defaultRole, tokenHash, expiresAt })) });
        await tx.authEmail.createMany({ data: prepared.map(({ row, encryptedText }) => ({ recipient: row.email, subject: `Invitation to ${school.name}`, encryptedText, expiresAt })) });
        const result = { dryRun: false, created: rows.length, errorCount: 0, errors: [], defaultRole: input.defaultRole, replayed: false };
        const batch = await tx.importBatch.create({ data: { organizationId, kind: 'STAFF_INVITATIONS', idempotencyKey: input.idempotencyKey, requestHash, result } });
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'USER_INVITED', entity: 'ImportBatch', entityId: batch.id, metadata: { operation: 'STAFF_IMPORT', created: rows.length, role: input.defaultRole } } });
        return result;
    });
}
exports.pendingStaffRoleSchema = zod_1.z.object({ role: zod_1.z.enum(['PROPRIETOR', 'PRINCIPAL', 'SCHOOL_ADMIN', 'BURSAR', 'TEACHER', 'EXAM_OFFICER', 'STAFF']) }).strict();
async function updatePendingStaffRole(organizationId, actorId, id, raw) {
    zod_1.z.string().uuid().parse(id);
    const { role } = exports.pendingStaffRoleSchema.parse(raw);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const actor = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true } } });
        if (!actor || !['PROPRIETOR', 'PRINCIPAL', 'SCHOOL_ADMIN'].includes((0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(actor))))
            throw new errors_1.AppError(403, 'FORBIDDEN', 'Cannot assign staff roles');
        const invitation = await tx.schoolInvitation.findFirst({ where: { id, organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
        if (!invitation || invitation.role === 'PARENT')
            throw new errors_1.AppError(404, 'NOT_FOUND', 'Pending staff invitation not found');
        if ((0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(actor)) === 'PRINCIPAL' && (!(0, rbac_1.principalCanManageRole)(role) || !(0, rbac_1.principalCanManageRole)(invitation.role)))
            throw new errors_1.AppError(403, 'FORBIDDEN', 'Principals may assign academic roles only');
        if ((role === 'PROPRIETOR' || invitation.role === 'PROPRIETOR') && (0, rbac_1.primaryRole)((0, rbac_1.membershipRoles)(actor)) !== 'PROPRIETOR')
            throw new errors_1.AppError(403, 'FORBIDDEN', 'Only an owner can assign owner access');
        await tx.schoolInvitation.update({ where: { id }, data: { role, invitedById: actorId } });
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'ROLE_CHANGED', entity: 'SchoolInvitation', entityId: id, metadata: { from: invitation.role, to: role } } });
        return { id, role };
    });
}
