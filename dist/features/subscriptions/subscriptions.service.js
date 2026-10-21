"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionsService = exports.SubscriptionsService = void 0;
const prisma_1 = require("../../lib/prisma");
const PLAN_CAPS = {
    FREE: 100,
    STARTER: 250,
    GROWTH: 600,
    PRO: 1500,
    ENTERPRISE: 100_000,
};
class SubscriptionsService {
    async get(organizationId) {
        let sub = await prisma_1.prisma.subscription.findUnique({
            where: { organizationId },
        });
        if (!sub) {
            sub = await prisma_1.prisma.subscription.create({
                data: {
                    organizationId,
                    plan: "FREE",
                    status: "ACTIVE",
                    studentCap: PLAN_CAPS.FREE,
                    sponsorship: "SCHOOL",
                },
            });
        }
        const studentCount = await prisma_1.prisma.student.count({
            where: { organizationId, isActive: true },
        });
        return {
            ...sub,
            studentCount,
            seatsRemaining: Math.max(0, sub.studentCap - studentCount),
        };
    }
}
exports.SubscriptionsService = SubscriptionsService;
exports.subscriptionsService = new SubscriptionsService();
