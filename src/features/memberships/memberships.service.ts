import type { OrgRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { invitationsService } from "../auth/invitations.service";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { clearStaffAssignments, TEACHING_ROLES } from "../../lib/staffing";
import type { z } from "zod";
import type {
  createMembershipSchema,
  listMembershipsQuerySchema,
  updateMembershipSchema,
} from "./memberships.validation";

type CreateInput = z.infer<typeof createMembershipSchema>;
type UpdateInput = z.infer<typeof updateMembershipSchema>;
type ListQuery = z.infer<typeof listMembershipsQuerySchema>;

const SAFE_ROLES_FOR_NON_OWNER: OrgRole[] = [
  "PRINCIPAL",
  "BURSAR",
  "SCHOOL_ADMIN",
  "TEACHER",
  "EXAM_OFFICER",
  "PARENT",
  "STAFF",
];

export class MembershipsService {
  async list(organizationId: string, query: ListQuery) {
    const skip = (query.page - 1) * query.limit;
    const where = { organizationId };

    const [rows, total] = await Promise.all([
      prisma.membership.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { joinedAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.membership.count({ where }),
    ]);

    return {
      items: rows.map((m) => ({
        id: m.id,
        role: m.role,
        isActive: m.isActive,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async create(
    organizationId: string,
    actor: { userId: string; orgRole: OrgRole | null },
    input: CreateInput,
    requestId?: string
  ) {
    return invitationsService.create(organizationId, actor.userId, input, requestId);
  }

  async update(
    organizationId: string,
    membershipId: string,
    actor: { userId: string; orgRole: OrgRole | null },
    input: UpdateInput,
    requestId?: string
  ) {
    return schoolTransaction(organizationId, async tx => {
      const manager = await tx.membership.findFirst({ where: { organizationId, userId: actor.userId,
        isActive: true, user: { isActive: true } } });
      if (!manager || !["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(manager.role)) {
        throw new AppError(403, "FORBIDDEN", "Cannot manage memberships");
      }
      actor = { ...actor, orgRole: manager.role };
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      throw new AppError(404, "NOT_FOUND", "Membership not found");
    }
    if (membership.role === "PROPRIETOR" && actor.orgRole !== "PROPRIETOR") {
      throw new AppError(403, "FORBIDDEN", "Only a proprietor can manage another proprietor");
    }

    if (input.role) {
      this.assertCanAssignRole(actor.orgRole, input.role);
    }

    // Prevent removing last PROPRIETOR
    if (
      membership.role === "PROPRIETOR" &&
      ((input.role !== undefined && input.role !== "PROPRIETOR") ||
        input.isActive === false)
    ) {
      const proprietors = await tx.membership.count({
        where: {
          organizationId,
          role: "PROPRIETOR",
          isActive: true,
        },
      });
      if (proprietors <= 1) {
        throw new AppError(
          400,
          "LAST_PROPRIETOR",
          "Cannot remove or demote the last proprietor"
        );
      }
    }

    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: {
        role: input.role,
        isActive: input.isActive,
      },
    });
    if (!updated.isActive || !(TEACHING_ROLES as readonly string[]).includes(updated.role)) {
      await clearStaffAssignments(tx, organizationId, membership.userId);
    }

    if (input.role && input.role !== membership.role) {
      await tx.auditLog.create({ data: {
        action: "ROLE_CHANGED",
        actorId: actor.userId,
        organizationId,
        entity: "Membership",
        entityId: membershipId,
        metadata: { from: membership.role, to: input.role },
        requestId,
      } });
    }

    if (input.isActive !== undefined && input.isActive !== membership.isActive) {
      await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", actorId: actor.userId, organizationId,
        entity: "Membership", entityId: membershipId, requestId, metadata: { isActive: input.isActive } } });
    }
    return updated;
    });
  }

  private assertCanAssignRole(actorRole: OrgRole | null, targetRole: OrgRole) {
    if (targetRole === "PROPRIETOR" && actorRole !== "PROPRIETOR") {
      throw new AppError(403, "FORBIDDEN", "Only a proprietor can assign proprietor access");
    }
    if (actorRole === "PROPRIETOR" || actorRole === "SCHOOL_ADMIN") {
      return;
    }
    if (actorRole === "PRINCIPAL") {
      if (targetRole === "PROPRIETOR") {
        throw new AppError(403, "FORBIDDEN", "Cannot assign proprietor role");
      }
      if (
        !SAFE_ROLES_FOR_NON_OWNER.includes(targetRole) &&
        targetRole !== "PRINCIPAL"
      ) {
        // principal may assign teacher, bursar, etc.
      }
      return;
    }
    throw new AppError(403, "FORBIDDEN", "Cannot manage memberships");
  }
}

export const membershipsService = new MembershipsService();
