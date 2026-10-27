"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitationsService = exports.InvitationsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const token_1 = require("../../lib/token");
const password_1 = require("../../lib/password");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const authEmail_1 = require("../../lib/authEmail");
class InvitationsService {
    async create(organizationId, actorId, input, requestId) {
        const email = input.email.trim().toLowerCase(), token = (0, token_1.randomToken)(32);
        const link = (0, authEmail_1.authLink)("/accept-invitation", token), expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const actor = await tx.membership.findFirst({
                where: {
                    userId: actorId,
                    organizationId,
                    isActive: true,
                    user: { isActive: true },
                },
            });
            if (!actor ||
                !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(actor.role) ||
                (input.role === "PROPRIETOR" && actor.role !== "PROPRIETOR"))
                throw new errors_1.AppError(403, "FORBIDDEN", "Cannot invite this role");
            const school = await tx.organization.findFirst({
                where: { id: organizationId, isActive: true },
            });
            if (!school)
                throw new errors_1.AppError(404, "NOT_FOUND", "School not found");
            const user = await tx.user.findUnique({ where: { email } });
            const existingMembership = user
                ? await tx.membership.findUnique({
                    where: {
                        userId_organizationId: { userId: user.id, organizationId },
                    },
                })
                : null;
            if (existingMembership &&
                !(input.parentId &&
                    existingMembership.role === "PARENT" &&
                    existingMembership.isActive)) {
                throw new errors_1.AppError(409, "ALREADY_MEMBER", "User is already a member; update their membership instead");
            }
            if (input.parentId) {
                const parent = await tx.parent.findFirst({
                    where: { id: input.parentId, organizationId, isActive: true },
                });
                if (!parent || parent.userId)
                    throw new errors_1.AppError(409, "PARENT_UNAVAILABLE", "Parent is unavailable or already linked to a login");
                if (user &&
                    (await tx.parent.findFirst({
                        where: { organizationId, userId: user.id },
                    }))) {
                    throw new errors_1.AppError(409, "PARENT_PROFILE_CONFLICT", "This login already has a parent profile in this school");
                }
            }
            await tx.schoolInvitation.updateMany({
                where: {
                    organizationId,
                    acceptedAt: null,
                    revokedAt: null,
                    OR: [
                        { email },
                        ...(input.parentId ? [{ parentId: input.parentId }] : []),
                    ],
                },
                data: { revokedAt: new Date() },
            });
            const invitation = await tx.schoolInvitation.create({
                data: {
                    ...input,
                    email,
                    organizationId,
                    invitedById: actorId,
                    tokenHash: (0, token_1.sha256)(token),
                    expiresAt,
                },
            });
            await (0, authEmail_1.enqueueAuthEmail)(tx, email, `Invitation to ${school.name}`, `You have been invited to ${school.name}.\nAccept within 48 hours: ${link}\nIf you already have an account, sign in before accepting.`, expiresAt);
            await tx.auditLog.create({
                data: {
                    action: "USER_INVITED",
                    actorId,
                    organizationId,
                    entity: "SchoolInvitation",
                    entityId: invitation.id,
                    requestId,
                    metadata: { email, role: input.role },
                },
            });
            return {
                id: invitation.id,
                email,
                role: invitation.role,
                expiresAt,
                status: "PENDING",
            };
        });
    }
    async accept(token, password, signedInUserId, currentPassword) {
        const tokenHash = (0, token_1.sha256)(token);
        const candidate = await prisma_1.prisma.schoolInvitation.findUnique({
            where: { tokenHash },
        });
        if (!candidate)
            throw new errors_1.AppError(400, "INVALID_INVITATION", "Invitation is invalid or expired");
        const passwordHash = password ? await (0, password_1.hashPassword)(password) : undefined;
        return (0, schoolTransaction_1.schoolTransaction)(candidate.organizationId, async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`identity:${candidate.email}`})::bigint)`;
            const invitation = await tx.schoolInvitation.findFirst({
                where: {
                    id: candidate.id,
                    tokenHash,
                    acceptedAt: null,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                    organization: { isActive: true },
                },
            });
            if (!invitation)
                throw new errors_1.AppError(400, "INVALID_INVITATION", "Invitation is invalid or expired");
            const inviter = await tx.membership.findFirst({
                where: {
                    userId: invitation.invitedById,
                    organizationId: invitation.organizationId,
                    isActive: true,
                    user: { isActive: true },
                },
            });
            if (!inviter ||
                !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(inviter.role) ||
                (invitation.role === "PROPRIETOR" && inviter.role !== "PROPRIETOR"))
                throw new errors_1.AppError(400, "INVALID_INVITATION", "Invitation is no longer authorized");
            let user = await tx.user.findUnique({
                where: { email: invitation.email },
            });
            if (user) {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`auth:${user.id}`})::bigint)`;
                user = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
                if (!user.isActive || user.email.toLowerCase() !== invitation.email)
                    throw new errors_1.AppError(403, "ACCOUNT_DISABLED", "Account is unavailable");
                if (signedInUserId !== user.id &&
                    !(currentPassword &&
                        (await (0, password_1.verifyPassword)(currentPassword, user.passwordHash)))) {
                    throw new errors_1.AppError(409, "EXISTING_ACCOUNT_LOGIN", "Sign in or supply the invited account's current password");
                }
            }
            else {
                if (signedInUserId || !passwordHash)
                    throw new errors_1.AppError(400, "PASSWORD_REQUIRED", "Choose a password for the invited account");
                user = await tx.user.create({
                    data: {
                        email: invitation.email,
                        firstName: invitation.firstName,
                        lastName: invitation.lastName,
                        phone: invitation.phone,
                        passwordHash,
                    },
                });
            }
            const existingMembership = await tx.membership.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId: invitation.organizationId,
                    },
                },
            });
            if (existingMembership &&
                !(invitation.parentId &&
                    existingMembership.role === "PARENT" &&
                    existingMembership.isActive)) {
                throw new errors_1.AppError(409, "ALREADY_MEMBER", "Membership already exists; ask an administrator to update it");
            }
            if (invitation.parentId) {
                const linked = await tx.parent.findFirst({
                    where: { organizationId: invitation.organizationId, userId: user.id },
                });
                if (linked)
                    throw new errors_1.AppError(409, "PARENT_PROFILE_CONFLICT", "This login already has a parent profile in this school");
                const updated = await tx.parent.updateMany({
                    where: {
                        id: invitation.parentId,
                        organizationId: invitation.organizationId,
                        isActive: true,
                        userId: null,
                    },
                    data: { userId: user.id, email: invitation.email },
                });
                if (updated.count !== 1)
                    throw new errors_1.AppError(409, "PARENT_UNAVAILABLE", "Parent is no longer available");
            }
            const membership = existingMembership ??
                (await tx.membership.create({
                    data: {
                        organizationId: invitation.organizationId,
                        userId: user.id,
                        role: invitation.role,
                    },
                }));
            await tx.schoolInvitation.update({
                where: { id: invitation.id },
                data: { acceptedAt: new Date() },
            });
            await tx.auditLog.create({
                data: {
                    action: "USER_INVITED",
                    actorId: user.id,
                    organizationId: invitation.organizationId,
                    entity: "SchoolInvitation",
                    entityId: invitation.id,
                    metadata: {
                        operation: "INVITATION_ACCEPTED",
                        membershipId: membership.id,
                    },
                },
            });
            return {
                membershipId: membership.id,
                schoolId: invitation.organizationId,
                role: membership.role,
            };
        });
    }
    async revoke(organizationId, id, actorId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const invitation = await tx.schoolInvitation.findFirst({
                where: { id, organizationId, acceptedAt: null },
            });
            if (!invitation)
                throw new errors_1.AppError(404, "NOT_FOUND", "Pending invitation not found");
            await tx.schoolInvitation.update({
                where: { id },
                data: { revokedAt: new Date() },
            });
            await tx.auditLog.create({
                data: {
                    action: "SETTINGS_CHANGED",
                    actorId,
                    organizationId,
                    entity: "SchoolInvitation",
                    entityId: id,
                    metadata: { operation: "INVITATION_REVOKED" },
                },
            });
            return { ok: true };
        });
    }
}
exports.InvitationsService = InvitationsService;
exports.invitationsService = new InvitationsService();
