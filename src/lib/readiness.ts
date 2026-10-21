import { prisma } from "./prisma";

export const readiness = {
  checkDatabase: () => prisma.$queryRaw`SELECT 1`,
};
