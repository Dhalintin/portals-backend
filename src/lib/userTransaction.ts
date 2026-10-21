import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Session issuance, rotation, logout and password resets use the same user
// lock. This prevents an old password verified just before a reset from
// creating a new session immediately after all sessions were revoked.
export function userTransaction<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auth:${userId}`})::bigint)`;
    return work(tx);
  }, { maxWait: 10_000, timeout: 15_000 });
}
