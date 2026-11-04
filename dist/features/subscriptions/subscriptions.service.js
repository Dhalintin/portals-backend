"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionsService = exports.SubscriptionsService = void 0;
const prisma_1 = require("../../lib/prisma");
const termBilling_1 = require("./termBilling");
class SubscriptionsService {
    async get(organizationId) { return { plan: 'PER_STUDENT', status: (await (0, termBilling_1.billingAccess)(organizationId)).status, studentCap: 1000000, studentCount: await prisma_1.prisma.student.count({ where: { organizationId, isActive: true } }) }; }
}
exports.SubscriptionsService = SubscriptionsService;
exports.subscriptionsService = new SubscriptionsService();
