"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolTransaction = schoolTransaction;
const prisma_1 = require("./prisma");
// Serialize cooperating financial, calendar and staffing writers for one school. The lock is released
// automatically on commit/rollback. No provider/network calls belong inside it.
function schoolTransaction(organizationId, work) {
    return prisma_1.prisma.$transaction(async (tx) => {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${organizationId})::bigint)`;
        return work(tx);
    }, { maxWait: 10_000, timeout: 30_000 });
}
