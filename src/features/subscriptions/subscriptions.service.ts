import { prisma } from '../../lib/prisma';
import { billingAccess } from './termBilling';
export class SubscriptionsService {
    async get(organizationId: string) { return { plan: 'PER_STUDENT', status: (await billingAccess(organizationId)).status, studentCap: 1000000, studentCount: await prisma.student.count({ where: { organizationId, isActive: true } }) }; }
}
export const subscriptionsService = new SubscriptionsService();
