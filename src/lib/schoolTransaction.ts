import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Serialize cooperating financial, calendar and staffing writers for one school. The lock is released
// automatically on commit/rollback. No provider/network calls belong inside it.
export function schoolTransaction<T>(
  organizationId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId})::bigint)`;
    return work(tx);
  }, { maxWait: 10_000, timeout: 30_000 });
}
