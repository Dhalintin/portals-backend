import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type WriteAuditInput = {
  action: AuditAction;
  actorId?: string | null;
  organizationId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  requestId?: string | null;
};

export class AuditService {
  async write(input: WriteAuditInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: input.action,
          actorId: input.actorId ?? null,
          organizationId: input.organizationId ?? null,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? undefined,
          requestId: input.requestId ?? null,
        },
      });
    } catch {
      // Audit must not break primary flow; log to stderr in production setup
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("audit write failed", input.action);
      }
    }
  }
}

export const auditService = new AuditService();
