import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";

const PLAN_CAPS: Record<string, number> = {
  FREE: 100,
  STARTER: 250,
  GROWTH: 600,
  PRO: 1500,
  ENTERPRISE: 100_000,
};

export class SubscriptionsService {
  async get(organizationId: string) {
    let sub = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub) {
      sub = await prisma.subscription.create({
        data: {
          organizationId,
          plan: "FREE",
          status: "ACTIVE",
          studentCap: PLAN_CAPS.FREE,
          sponsorship: "SCHOOL",
        },
      });
    }

    const studentCount = await prisma.student.count({
      where: { organizationId, isActive: true },
    });

    return {
      ...sub,
      studentCount,
      seatsRemaining: Math.max(0, sub.studentCap - studentCount),
    };
  }
}

export const subscriptionsService = new SubscriptionsService();
