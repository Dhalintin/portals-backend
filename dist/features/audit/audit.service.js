"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
const prisma_1 = require("../../lib/prisma");
class AuditService {
    async write(input) {
        try {
            await prisma_1.prisma.auditLog.create({
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
        }
        catch {
            // Audit must not break primary flow; log to stderr in production setup
            if (process.env.NODE_ENV === "development") {
                // eslint-disable-next-line no-console
                console.error("audit write failed", input.action);
            }
        }
    }
}
exports.AuditService = AuditService;
exports.auditService = new AuditService();
