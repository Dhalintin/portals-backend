"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationTransport = void 0;
exports.enqueueAnnouncement = enqueueAnnouncement;
exports.processNotificationEmail = processNotificationEmail;
const prisma_1 = require("./prisma");
const env_1 = require("../config/env");
const authEmail_1 = require("./authEmail");
const studentNotifications_1 = require("./studentNotifications");
async function enqueueAnnouncement(tx, announcement) {
    if (!announcement.isActive || !announcement.isPublished)
        return;
    const parents = await tx.parent.findMany({ where: { organizationId: announcement.organizationId, isActive: true, email: { not: null } }, select: { id: true, email: true } });
    const recipients = new Set();
    const data = parents.flatMap(parent => {
        const recipient = parent.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipients.has(recipient))
            return [];
        recipients.add(recipient);
        return [{ organizationId: announcement.organizationId, eventKey: `announcement:${announcement.id}:${recipient}`,
                type: "ANNOUNCEMENT", channel: "email", recipient, title: announcement.title, body: announcement.body,
                entityType: "Announcement", entityId: announcement.id, expiresAt: announcement.expiresAt ?? new Date(Date.now() + 7 * 86400000),
                payload: { parentId: parent.id } }];
    });
    if (data.length)
        await tx.notificationOutbox.createMany({ data, skipDuplicates: true });
}
exports.notificationTransport = {
    async send(job) {
        await authEmail_1.authEmailTransport.send({ id: `notification-${job.id}`, recipient: job.recipient, subject: job.title ?? "School notification", text: job.body });
    },
};
async function processNotificationEmail(organizationId) {
    if (env_1.env.EMAIL_PROVIDER === "disabled")
        return { status: "disabled" };
    (0, authEmail_1.assertEmailDeliveryConfigured)();
    const now = new Date(), stale = new Date(Date.now() - 90000);
    await prisma_1.prisma.notificationOutbox.updateMany({ where: { ...(organizationId ? { organizationId } : {}), channel: "email", status: "PENDING",
            attempts: { gte: 5 }, OR: [{ lockedAt: null }, { lockedAt: { lt: stale } }] }, data: { status: "FAILED", lockedAt: null, error: "RETRY_LIMIT" } });
    await prisma_1.prisma.notificationOutbox.updateMany({ where: { ...(organizationId ? { organizationId } : {}), status: "PENDING", expiresAt: { lte: now } },
        data: { status: "CANCELLED", lockedAt: null, error: "EXPIRED" } });
    const jobs = await prisma_1.prisma.$queryRaw `
    WITH candidate AS (
      SELECT job."id" FROM "NotificationOutbox" job JOIN "Organization" school ON school."id" = job."organizationId"
      WHERE school."isActive" = true AND job."channel" = 'email' AND job."status" = 'PENDING' AND job."attempts" < 5
      AND job."scheduledAt" <= timezone('UTC', NOW()) AND job."nextAttemptAt" <= timezone('UTC', NOW())
      AND (job."expiresAt" IS NULL OR job."expiresAt" > timezone('UTC', NOW()))
      AND (job."lockedAt" IS NULL OR job."lockedAt" < timezone('UTC', NOW()) - INTERVAL '90 seconds')
      AND (${organizationId ?? null}::text IS NULL OR job."organizationId" = ${organizationId ?? null})
      ORDER BY job."scheduledAt", job."id" FOR UPDATE OF job SKIP LOCKED LIMIT 1
    ) UPDATE "NotificationOutbox" job SET "lockedAt" = timezone('UTC', NOW()), "attempts" = job."attempts" + 1
      FROM candidate WHERE job."id" = candidate."id" RETURNING job.*
  `;
    const job = jobs[0];
    if (!job)
        return { status: "idle" };
    const lease = { id: job.id, status: "PENDING", attempts: job.attempts };
    try {
        if (!await (0, studentNotifications_1.studentNotificationIsCurrent)(prisma_1.prisma, job)) {
            await prisma_1.prisma.notificationOutbox.updateMany({ where: lease, data: { status: "CANCELLED", lockedAt: null, error: "EVENT_OR_RECIPIENT_CHANGED" } });
            return { status: "cancelled", id: job.id };
        }
        if (job.entityType === "Announcement" && job.entityId) {
            const announcement = await prisma_1.prisma.announcement.findFirst({ where: { id: job.entityId, organizationId: job.organizationId, isActive: true,
                    isPublished: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
            if (!announcement || !await prisma_1.prisma.parent.findFirst({ where: { organizationId: job.organizationId, isActive: true, email: { equals: job.recipient, mode: "insensitive" } } })) {
                await prisma_1.prisma.notificationOutbox.updateMany({ where: lease, data: { status: "CANCELLED", lockedAt: null, error: "RECIPIENT_OR_ANNOUNCEMENT_INACTIVE" } });
                return { status: "cancelled", id: job.id };
            }
        }
        await exports.notificationTransport.send(job);
        const updated = await prisma_1.prisma.notificationOutbox.updateMany({ where: lease, data: { status: "SENT", sentAt: new Date(), lockedAt: null, error: null } });
        return { status: updated.count ? "sent" : "lease-lost", id: job.id };
    }
    catch {
        await prisma_1.prisma.notificationOutbox.updateMany({ where: lease, data: { status: job.attempts >= 5 ? "FAILED" : "PENDING", lockedAt: null,
                error: "EMAIL_DELIVERY_FAILED", nextAttemptAt: new Date(Date.now() + 30000 * 2 ** (job.attempts - 1)) } });
        return { status: "retry", id: job.id };
    }
}
