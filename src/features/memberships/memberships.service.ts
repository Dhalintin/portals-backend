import { principalCanManageRole, membershipRoles, primaryRole } from "../../auth/rbac";
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
        roles: membershipRoles(m),
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
      if (!manager || !membershipRoles(manager).some(role=>["PROPRIETOR", "SCHOOL_ADMIN", "PRINCIPAL"].includes(role))) {
        throw new AppError(403, "FORBIDDEN", "Cannot manage memberships");
      }
      actor = { ...actor, orgRole: primaryRole(membershipRoles(manager)) };
      const membership=await tx.membership.findFirst({where:{id:membershipId,organizationId}});
      if(!membership)throw new AppError(404,"NOT_FOUND","Membership not found");
      const before=membershipRoles(membership),requested=input.roles??(input.role?[input.role]:before);
      const roles=[...new Set(requested)],role=primaryRole(roles);
      if((before.includes('PROPRIETOR')||roles.includes('PROPRIETOR'))&&actor.orgRole!=='PROPRIETOR')throw new AppError(403,'FORBIDDEN','Only an owner can manage owner access');
      if(actor.orgRole==='PRINCIPAL'&&[...before,...roles].some(role=>!principalCanManageRole(role)))throw new AppError(403,'FORBIDDEN','Principals may manage academic roles only');
      for(const assigned of roles)this.assertCanAssignRole(actor.orgRole,assigned);
      if(before.includes('PARENT')!==roles.includes('PARENT'))throw new AppError(400,'ROLE_PORTAL_CHANGE','Parent and staff accounts cannot be converted through staff roles');
      if(before.includes('PROPRIETOR')&&(!roles.includes('PROPRIETOR')||input.isActive===false)){
        const count=await tx.membership.count({where:{organizationId,isActive:true,role:'PROPRIETOR'}});
        if(count<=1)throw new AppError(400,'LAST_PROPRIETOR','Cannot remove or demote the last proprietor');
      }
      const updated=await tx.membership.update({where:{id:membershipId},data:{role,roles,isActive:input.isActive}});
      if(!updated.isActive||!roles.some(role=>(input.role||input.roles?['TEACHER','EXAM_OFFICER']:TEACHING_ROLES as readonly string[]).includes(role)))await clearStaffAssignments(tx,organizationId,membership.userId);
      if(JSON.stringify(before)!==JSON.stringify(membershipRoles(updated)))await tx.auditLog.create({data:{action:'ROLE_CHANGED',actorId:actor.userId,organizationId,entity:'Membership',entityId:membershipId,metadata:{from:before,to:membershipRoles(updated)},requestId}});

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
      if (!principalCanManageRole(targetRole)) throw new AppError(403, "FORBIDDEN", "Principals may assign academic roles only.");
      return;
    }
    throw new AppError(403, "FORBIDDEN", "Cannot manage memberships");
  }
}

export const membershipsService = new MembershipsService();
