import { principalCanManageRole } from "../../auth/rbac";
import type { OrgRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { randomToken, sha256 } from "../../lib/token";
import { hashPassword, verifyPassword } from "../../lib/password";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { authLink, enqueueAuthEmail } from "../../lib/authEmail";
import type { GoogleProfile } from "../../lib/goggle";

export class InvitationsService {
  async inspect(token: string) {
    const invitation = await prisma.schoolInvitation.findFirst({
      where: { tokenHash: sha256(token), acceptedAt: null, revokedAt: null,
        expiresAt: { gt: new Date() }, organization: { isActive: true } },
      select: { email: true, organization: { select: { name: true } } },
    });
    if (!invitation) throw new AppError(400, "INVALID_INVITATION", "Invitation is invalid or expired. Ask your school for a new invitation.");
    const account = await prisma.user.findUnique({ where: { email: invitation.email }, select: { passwordHash: true } });
    return { email: invitation.email, schoolName: invitation.organization.name, needsPassword: !account?.passwordHash };
  }

  async create(
    organizationId: string,
    actorId: string,
    input: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      role: OrgRole;
      parentId?: string;
    },
    requestId?: string
  ) {
    const email = input.email.trim().toLowerCase(),
      token = randomToken(32);
    const link = authLink("/accept-invitation", token),
      expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    return schoolTransaction(organizationId, async (tx) => {
      const actor = await tx.membership.findFirst({
        where: {
          userId: actorId,
          organizationId,
          isActive: true,
          user: { isActive: true },
        },
      });
      if (
        !actor ||
        !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(actor.role) ||
        (input.role === "PROPRIETOR" && actor.role !== "PROPRIETOR")
      )
        throw new AppError(403, "FORBIDDEN", "Cannot invite this role");
      if (actor.role === "PRINCIPAL" && !principalCanManageRole(input.role)) throw new AppError(403, "FORBIDDEN", "Only an owner or school administrator can grant financial or administrator roles.");
      const school = await tx.organization.findFirst({
        where: { id: organizationId, isActive: true },
      });
      if (!school) throw new AppError(404, "NOT_FOUND", "School not found");
      const user = await tx.user.findUnique({ where: { email } });
      const existingMembership = user
        ? await tx.membership.findUnique({
            where: {
              userId_organizationId: { userId: user.id, organizationId },
            },
          })
        : null;
      if (
        existingMembership &&
        !(
          input.parentId &&
          existingMembership.role === "PARENT" &&
          existingMembership.isActive
        )
      ) {
        throw new AppError(
          409,
          "ALREADY_MEMBER",
          "User is already a member; update their membership instead"
        );
      }
      if (input.parentId) {
        const parent = await tx.parent.findFirst({
          where: { id: input.parentId, organizationId, isActive: true },
        });
        if (!parent || parent.userId)
          throw new AppError(
            409,
            "PARENT_UNAVAILABLE",
            "Parent is unavailable or already linked to a login"
          );
        if (
          user &&
          (await tx.parent.findFirst({
            where: { organizationId, userId: user.id },
          }))
        ) {
          throw new AppError(
            409,
            "PARENT_PROFILE_CONFLICT",
            "This login already has a parent profile in this school"
          );
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
          tokenHash: sha256(token),
          expiresAt,
        },
      });
      await enqueueAuthEmail(
        tx,
        email,
        `Invitation to ${school.name}`,
        `You have been invited to ${school.name}.\nAccept within 48 hours: ${link}\nOpen the link and join with Google or a password using this invited email. If you already have a password, use that password.`,
        expiresAt
      );
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

  async accept(
    token: string,
    password?: string,
    signedInUserId?: string,
    currentPassword?: string,
    profile?: { firstName: string; lastName: string; google?: GoogleProfile }
  ) {
    const tokenHash = sha256(token);
    const candidate = await prisma.schoolInvitation.findUnique({
      where: { tokenHash },
    });
    if (!candidate)
      throw new AppError(
        400,
        "INVALID_INVITATION",
        "Invitation is invalid or expired"
      );
    const passwordHash = password ? await hashPassword(password) : undefined;
    return schoolTransaction(candidate.organizationId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:${candidate.email}`})::bigint)`;
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
        throw new AppError(
          400,
          "INVALID_INVITATION",
          "Invitation is invalid or expired"
        );
      const inviter = await tx.membership.findFirst({
        where: {
          userId: invitation.invitedById,
          organizationId: invitation.organizationId,
          isActive: true,
          user: { isActive: true },
        },
      });
      if (
        !inviter ||
        !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(inviter.role) ||
        (invitation.role === "PROPRIETOR" && inviter.role !== "PROPRIETOR")
      )
        throw new AppError(
          400,
          "INVALID_INVITATION",
          "Invitation is no longer authorized"
        );
      if (profile?.google && (!profile.google.emailVerified || profile.google.email !== invitation.email)) {
        throw new AppError(403, "INVITATION_EMAIL_MISMATCH", "Choose the Google account for the email that received this invitation.");
      }
      if (inviter.role === "PRINCIPAL" && !principalCanManageRole(invitation.role)) throw new AppError(400, "INVALID_INVITATION", "Ask the school owner to reissue this invitation.");
      const firstName = profile?.firstName?.trim() || invitation.firstName;
      const lastName = profile?.lastName?.trim() || invitation.lastName;
      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });
      if (user) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auth:${user.id}`})::bigint)`;
        user = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (!user.isActive || user.email.toLowerCase() !== invitation.email)
          throw new AppError(403, "ACCOUNT_DISABLED", "Account is unavailable");
        if (profile?.google) {
          if (user.googleId && user.googleId !== profile.google.googleId) throw new AppError(409, "GOOGLE_ACCOUNT_MISMATCH", "This account is linked to a different Google account.");
          user = await tx.user.update({ where: { id: user.id }, data: { googleId: profile.google.googleId,
            ...(!user.firstName ? { firstName } : {}), ...(!user.lastName ? { lastName } : {}) } });
        } else if (!user.passwordHash && passwordHash && !signedInUserId) {
          // Imported accounts have not chosen a password yet. The invitation proves
          // ownership of their email; only initialise an absent password.
          if (!firstName || !lastName) throw new AppError(400, "PROFILE_REQUIRED", "Enter your first and last names to finish joining.");
          user = await tx.user.update({ where: { id: user.id }, data: { passwordHash, firstName, lastName } });
        } else if (
          signedInUserId !== user.id &&
          !(
            currentPassword &&
            (await verifyPassword(currentPassword, user.passwordHash))
          )
        ) {
          throw new AppError(
            409,
            "EXISTING_ACCOUNT_LOGIN",
            "Sign in or supply the invited account's current password"
          );
        }
      } else {
        if (signedInUserId || (!passwordHash && !profile?.google))
          throw new AppError(
            400,
            "PASSWORD_REQUIRED",
            "Choose a password for the invited account"
          );
        if (!firstName || (!lastName && !profile?.google)) throw new AppError(400, "PROFILE_REQUIRED", "Enter your first and last names to finish joining.");
        user = await tx.user.create({
          data: {
            email: invitation.email,
            firstName,
            lastName,
            ...(profile?.google ? { googleId: profile.google.googleId, avatarUrl: profile.google.avatarUrl } : {}),
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
      if (
        existingMembership &&
        !(
          invitation.parentId &&
          existingMembership.role === "PARENT" &&
          existingMembership.isActive
        )
      ) {
        throw new AppError(
          409,
          "ALREADY_MEMBER",
          "Membership already exists; ask an administrator to update it"
        );
      }
      if (invitation.parentId) {
        const linked = await tx.parent.findFirst({
          where: { organizationId: invitation.organizationId, userId: user.id },
        });
        if (linked)
          throw new AppError(
            409,
            "PARENT_PROFILE_CONFLICT",
            "This login already has a parent profile in this school"
          );
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
          throw new AppError(
            409,
            "PARENT_UNAVAILABLE",
            "Parent is no longer available"
          );
      }
      const membership =
        existingMembership ??
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
        userId: user.id,
        authVersion: user.authVersion,
        membershipId: membership.id,
        schoolId: invitation.organizationId,
        role: membership.role,
      };
    });
  }

  async revoke(organizationId: string, id: string, actorId: string) {
    return schoolTransaction(organizationId, async (tx) => {
      const invitation = await tx.schoolInvitation.findFirst({
        where: { id, organizationId, acceptedAt: null },
      });
      if (!invitation)
        throw new AppError(404, "NOT_FOUND", "Pending invitation not found");
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
export const invitationsService = new InvitationsService();
