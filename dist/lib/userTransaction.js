"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userTransaction = userTransaction;
const prisma_1 = require("./prisma");
// Session issuance, rotation, logout and password resets use the same user
// lock. This prevents an old password verified just before a reset from
// creating a new session immediately after all sessions were revoked.
function userTransaction(userId, work) {
    return prisma_1.prisma.$transaction(async (tx) => {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`auth:${userId}`})::bigint)`;
        return work(tx);
    }, { maxWait: 10_000, timeout: 15_000 });
}
