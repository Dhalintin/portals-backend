"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communicationService = exports.CommunicationService = void 0;
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const notificationDelivery_1 = require("../../lib/notificationDelivery");
const node_crypto_1 = require("node:crypto");
const errors_1 = require("../../lib/errors");
class CommunicationService {
    db;
    constructor(db = prisma_1.prisma) {
        this.db = db;
    }
    // ─── Announcements ─────────────────────────────────────────────
    // async createAnnouncement(
    //   organizationId: string,
    //   data: {
    //     title: string;
    //     body: string;
    //     isPinned?: boolean;
    //     expiresAt?: string | null;
    //   },
    //   actorId: string | undefined,
    //   meta?: { requestId?: string }
    // ) {
    //   const announcement = await this.db.announcement.create({
    //     data: {
    //       organizationId,
    //       title: data.title,
    //       body: data.body,
    //       isPinned: data.isPinned ?? false,
    //       expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    //     },
    //   });
    //   await this.db.auditLog.create({ data: {
    //     action: "OTHER",
    //     actorId,
    //     organizationId,
    //     entity: "Announcement",
    //     entityId: announcement.id,
    //     metadata: { title: announcement.title },
    //     requestId: meta?.requestId,
    //   });
    //   return announcement;
    // }
    async createAnnouncement(organizationId, data, actorId, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new CommunicationService(tx).createAnnouncementLocked(organizationId, data, actorId, meta));
    }
    async createAnnouncementLocked(organizationId, data, actorId, meta) {
        const now = new Date();
        const publishAt = data.publishAt ? new Date(data.publishAt) : null;
        const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        if (publishAt && isNaN(publishAt.getTime())) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Invalid publish date");
        }
        if (expiresAt && isNaN(expiresAt.getTime())) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Invalid expiration date");
        }
        if (expiresAt && (expiresAt <= now || (publishAt && expiresAt <= publishAt))) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Expiration must follow publication and be in the future");
        }
        const publishImmediately = publishAt !== null && publishAt <= now;
        const announcement = await this.db.announcement.create({
            data: {
                organizationId,
                title: data.title,
                body: data.body,
                isPinned: data.isPinned ?? false,
                isPublished: publishImmediately,
                publishAt: publishImmediately ? null : publishAt,
                publishedAt: publishImmediately ? now : null,
                expiresAt,
            },
        });
        if (announcement.isPublished)
            await (0, notificationDelivery_1.enqueueAnnouncement)(this.db, announcement);
        await this.db.auditLog.create({ data: {
                action: "OTHER",
                actorId,
                organizationId,
                entity: "Announcement",
                entityId: announcement.id,
                metadata: {
                    title: announcement.title,
                    action: publishImmediately
                        ? "PUBLISHED"
                        : publishAt
                            ? "SCHEDULED"
                            : "DRAFT",
                    publishAt: announcement.publishAt,
                },
                requestId: meta?.requestId,
            } });
        return announcement;
    }
    async publishAnnouncement(id, organizationId, actorId, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new CommunicationService(tx).publishAnnouncementLocked(id, organizationId, actorId, meta));
    }
    async publishAnnouncementLocked(id, organizationId, actorId, meta) {
        const announcement = await this.db.announcement.findFirst({
            where: {
                id,
                organizationId,
                isActive: true,
            },
        });
        if (!announcement) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Announcement not found");
        }
        if (announcement.isPublished) {
            return announcement;
        }
        const now = new Date();
        if (announcement.expiresAt && announcement.expiresAt <= now) {
            throw new errors_1.AppError(400, "ANNOUNCEMENT_EXPIRED", "This announcement has already expired");
        }
        const updated = await this.db.announcement.update({
            where: {
                id: announcement.id,
            },
            data: {
                isPublished: true,
                publishedAt: now,
                publishAt: null,
            },
        });
        await (0, notificationDelivery_1.enqueueAnnouncement)(this.db, updated);
        await this.db.auditLog.create({ data: {
                action: "OTHER",
                actorId,
                organizationId,
                entity: "Announcement",
                entityId: updated.id,
                metadata: {
                    title: updated.title,
                    action: "PUBLISHED",
                },
                requestId: meta?.requestId,
            } });
        return updated;
    }
    async publishScheduledAnnouncements() {
        const now = new Date();
        const due = await this.db.announcement.findMany({ where: { isActive: true, isPublished: false, publishAt: { lte: now },
                organization: { isActive: true }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, take: 50,
            orderBy: { publishAt: "asc" }, select: { id: true, organizationId: true } });
        let published = 0;
        for (const announcement of due) {
            try {
                const didPublish = await (0, schoolTransaction_1.schoolTransaction)(announcement.organizationId, async (tx) => {
                    const dueNow = await tx.announcement.findFirst({ where: { id: announcement.id, organizationId: announcement.organizationId,
                            isActive: true, isPublished: false, publishAt: { lte: new Date() }, organization: { isActive: true },
                            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
                    if (!dueNow)
                        return false;
                    await new CommunicationService(tx).publishAnnouncementLocked(announcement.id, announcement.organizationId, undefined);
                    return true;
                });
                if (didPublish)
                    published++;
            }
            catch (error) {
                if (!(error instanceof errors_1.AppError && [400, 404].includes(error.statusCode)))
                    throw error;
            }
        }
        return published;
    }
    // async listAnnouncements(
    //   organizationId: string,
    //   opts: { activeOnly?: boolean; limit?: number } = {}
    // ) {
    //   const now = new Date();
    //   const where: Prisma.AnnouncementWhereInput = { organizationId };
    //   if (opts.activeOnly !== false) {
    //     where.isActive = true;
    //     where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
    //   }
    //   return this.db.announcement.findMany({
    //     where,
    //     orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    //     take: opts.limit ?? 20,
    //   });
    // }
    async listAnnouncements(organizationId, options) {
        const { isAdmin, activeOnly = true, limit = 20 } = options;
        const now = new Date();
        const where = {
            organizationId,
            ...((activeOnly || !isAdmin)
                ? {
                    isActive: true,
                }
                : {}),
            ...(isAdmin
                ? {}
                : {
                    isPublished: true,
                    OR: [
                        {
                            expiresAt: null,
                        },
                        {
                            expiresAt: {
                                gt: now,
                            },
                        },
                    ],
                }),
        };
        return this.db.announcement.findMany({
            where,
            orderBy: [
                {
                    isPinned: "desc",
                },
                {
                    publishedAt: "desc",
                },
                {
                    createdAt: "desc",
                },
            ],
            take: limit,
        });
    }
    async getAnnouncement(id, organizationId, isAdmin) {
        const now = new Date();
        const where = {
            id,
            organizationId,
            ...(isAdmin
                ? {}
                : {
                    isActive: true,
                    isPublished: true,
                    OR: [
                        {
                            expiresAt: null,
                        },
                        {
                            expiresAt: {
                                gt: now,
                            },
                        },
                    ],
                }),
        };
        const announcement = await this.db.announcement.findFirst({ where });
        if (!announcement)
            throw new errors_1.AppError(404, "NOT_FOUND", "Announcement not found");
        return announcement;
    }
    // async getAnnouncement(organizationId: string, id: string) {
    //   const item = await this.db.announcement.findFirst({
    //     where: { id, organizationId },
    //   });
    //   if (!item) throw new AppError(404, "NOT_FOUND", "Announcement not found");
    //   return item;
    // }
    // async updateAnnouncement(
    //   organizationId: string,
    //   id: string,
    //   data: Partial<{
    //     title: string;
    //     body: string;
    //     isPinned: boolean;
    //     isActive: boolean;
    //     expiresAt: string | null;
    //   }>
    // ) {
    //   await this.getAnnouncement(organizationId, id);
    //   return this.db.announcement.update({
    //     where: { id },
    //     data: {
    //       ...data,
    //       expiresAt:
    //         data.expiresAt === undefined
    //           ? undefined
    //           : data.expiresAt
    //           ? new Date(data.expiresAt)
    //           : null,
    //     },
    //   });
    // }
    async updateAnnouncement(id, organizationId, data, actorId, meta) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new CommunicationService(tx).updateAnnouncementLocked(id, organizationId, data, actorId, meta));
    }
    async updateAnnouncementLocked(id, organizationId, data, actorId, meta) {
        const existing = await this.db.announcement.findFirst({
            where: {
                id,
                organizationId,
            },
        });
        if (!existing) {
            throw new errors_1.AppError(404, "NOT_FOUND", "Announcement not found");
        }
        const now = new Date();
        const publishAt = data.publishAt !== undefined
            ? data.publishAt
                ? new Date(data.publishAt)
                : null
            : existing.publishAt;
        const expiresAt = data.expiresAt !== undefined
            ? data.expiresAt
                ? new Date(data.expiresAt)
                : null
            : existing.expiresAt;
        if (publishAt && isNaN(publishAt.getTime())) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Invalid publish date");
        }
        if (expiresAt && isNaN(expiresAt.getTime())) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Invalid expiration date");
        }
        if (expiresAt && (expiresAt <= now || (publishAt && expiresAt <= publishAt))) {
            throw new errors_1.AppError(400, "INVALID_DATE", "Expiration must follow publication and be in the future");
        }
        const shouldPublish = !existing.isPublished && publishAt !== null && publishAt <= now;
        const announcement = await this.db.announcement.update({
            where: {
                id: existing.id,
            },
            data: {
                ...(data.title !== undefined && {
                    title: data.title,
                }),
                ...(data.body !== undefined && {
                    body: data.body,
                }),
                ...(data.isPinned !== undefined && {
                    isPinned: data.isPinned,
                }),
                ...(data.isActive !== undefined && {
                    isActive: data.isActive,
                }),
                publishAt: shouldPublish ? null : publishAt,
                isPublished: shouldPublish ? true : existing.isPublished,
                publishedAt: shouldPublish ? now : existing.publishedAt,
                expiresAt,
            },
        });
        if (shouldPublish)
            await (0, notificationDelivery_1.enqueueAnnouncement)(this.db, announcement);
        await this.db.auditLog.create({ data: {
                action: "OTHER",
                actorId,
                organizationId,
                entity: "Announcement",
                entityId: announcement.id,
                metadata: {
                    title: announcement.title,
                    action: shouldPublish ? "PUBLISHED" : "UPDATED",
                },
                requestId: meta?.requestId,
            } });
        return announcement;
    }
    async deleteAnnouncement(organizationId, id, isAdmin) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new CommunicationService(tx).deleteAnnouncementLocked(organizationId, id, isAdmin));
    }
    async deleteAnnouncementLocked(organizationId, id, isAdmin) {
        const item = await this.db.announcement.findFirst({ where: { id, organizationId } });
        if (!item)
            throw new errors_1.AppError(404, "NOT_FOUND", "Announcement not found");
        await this.db.notificationOutbox.updateMany({ where: { organizationId, entityType: "Announcement", entityId: id, status: "PENDING" },
            data: { status: "CANCELLED", lockedAt: null } });
        return this.db.announcement.update({ where: { id }, data: { isActive: false } });
    }
    // ─── Notification Outbox ───────────────────────────────────────
    async enqueue(organizationId, data) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => new CommunicationService(tx).enqueueLocked(organizationId, data));
    }
    async enqueueLocked(organizationId, data) {
        const requestHash = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({ ...data, eventKey: undefined }, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest("hex");
        const eventKey = data.eventKey ?? requestHash;
        const existing = await this.db.notificationOutbox.findUnique({ where: { organizationId_eventKey: { organizationId, eventKey } } });
        if (existing) {
            if (existing.requestHash !== requestHash)
                throw new errors_1.AppError(409, "EVENT_CONFLICT", "Notification key was used for another message");
            return existing;
        }
        return this.db.notificationOutbox.create({
            data: {
                organizationId,
                eventKey, requestHash,
                expiresAt: new Date((data.scheduledAt ? new Date(data.scheduledAt).getTime() : Date.now()) + 7 * 86400000),
                type: data.type,
                recipient: data.recipient,
                channel: data.channel ?? "whatsapp",
                title: data.title,
                body: data.body,
                payload: data.payload ?? {},
                entityType: data.entityType,
                entityId: data.entityId,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : new Date(),
            },
        });
    }
    /** Build a WhatsApp-ready message (provider can be stubbed) */
    buildWhatsAppPayload(opts) {
        const base = opts.deepLinkBase || process.env.APP_URL || "https://app.schoolos.ng";
        const link = (path) => `${base}${path}`;
        switch (opts.type) {
            case "PAYMENT_SUCCESS":
                return {
                    text: `✅ Payment received – ${opts.schoolName}\n\n` +
                        `Amount: ₦${Number(opts.data.amountNgn).toLocaleString()}\n` +
                        (opts.data.receiptNumber
                            ? `Receipt: ${opts.data.receiptNumber}\n`
                            : "") +
                        `\nView receipt: ${link(`/receipts/${opts.data.receiptId}`)}`,
                    link: link(`/receipts/${opts.data.receiptId}`),
                };
            case "RECEIPT":
                return {
                    text: `🧾 Receipt from ${opts.schoolName}\n` +
                        `₦${Number(opts.data.amountNgn).toLocaleString()}\n` +
                        `Ref: ${opts.data.receiptNumber}\n\n` +
                        `${link(`/receipts/${opts.data.receiptId}`)}`,
                    link: link(`/receipts/${opts.data.receiptId}`),
                };
            case "FEE_REMINDER":
                return {
                    text: `📢 Fee reminder – ${opts.schoolName}\n\n` +
                        `${opts.data.studentName} has an outstanding balance of ₦${Number(opts.data.outstandingNgn).toLocaleString()}.\n\n` +
                        `Pay now: ${link(`/fees/${opts.data.studentId}`)}`,
                    link: link(`/fees/${opts.data.studentId}`),
                };
            case "RESULT_PUBLISHED":
                return {
                    text: `📊 Results published – ${opts.schoolName}\n\n` +
                        `${opts.data.studentName}'s results for ${opts.data.termName} are now available.\n\n` +
                        `View: ${link(`/results/${opts.data.resultId}`)}`,
                    link: link(`/results/${opts.data.resultId}`),
                };
            case "ATTENDANCE_ABSENCE":
                return {
                    text: `⚠️ Attendance notice – ${opts.schoolName}\n\n` +
                        `${opts.data.studentName} was marked ${opts.data.status} on ${opts.data.date}.\n` +
                        (opts.data.note ? `Note: ${opts.data.note}\n` : "") +
                        `\nView: ${link(`/attendance/${opts.data.studentId}`)}`,
                    link: link(`/attendance/${opts.data.studentId}`),
                };
            case "ANNOUNCEMENT":
                return {
                    text: `📢 ${opts.data.title}\n\n` +
                        `${opts.data.body}\n\n` +
                        `– ${opts.schoolName}`,
                    link: link(`/announcements/${opts.data.announcementId}`),
                };
            default:
                return {
                    text: opts.data.body || "Notification from " + opts.schoolName,
                    link: base,
                };
        }
    }
    // ─── Trigger helpers (called from other services) ──────────────
    async notifyPaymentSuccess(organizationId, opts) {
        const org = await this.db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        });
        if (!org)
            return;
        const payload = this.buildWhatsAppPayload({
            schoolName: org.name,
            type: "PAYMENT_SUCCESS",
            data: opts,
        });
        return this.enqueue(organizationId, {
            type: "PAYMENT_SUCCESS",
            recipient: opts.recipientPhone,
            channel: "whatsapp",
            title: "Payment received",
            body: payload.text,
            payload: { ...opts, whatsapp: payload },
            entityType: "Receipt",
            entityId: opts.receiptId,
        });
    }
    async notifyResultPublished(organizationId, opts) {
        const org = await this.db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        });
        if (!org)
            return;
        const payload = this.buildWhatsAppPayload({
            schoolName: org.name,
            type: "RESULT_PUBLISHED",
            data: opts,
        });
        return this.enqueue(organizationId, {
            type: "RESULT_PUBLISHED",
            recipient: opts.recipientPhone,
            body: payload.text,
            payload: { ...opts, whatsapp: payload },
            entityType: "Result",
            entityId: opts.resultId,
        });
    }
    async notifyAbsence(organizationId, opts) {
        const org = await this.db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        });
        if (!org)
            return;
        const payload = this.buildWhatsAppPayload({
            schoolName: org.name,
            type: "ATTENDANCE_ABSENCE",
            data: opts,
        });
        return this.enqueue(organizationId, {
            type: "ATTENDANCE_ABSENCE",
            recipient: opts.recipientPhone,
            body: payload.text,
            payload: { ...opts, whatsapp: payload },
            entityType: "Student",
            entityId: opts.studentId,
        });
    }
    // Simple worker-style method (can be called by a cron or manually)
    async processOutbox(limit = 20, organizationId) {
        const pending = await this.db.notificationOutbox.findMany({
            where: {
                status: "PENDING",
                ...(organizationId ? { organizationId } : {}),
                scheduledAt: { lte: new Date() },
            },
            take: limit,
            orderBy: { scheduledAt: "asc" },
        });
        return pending.map(item => ({ id: item.id, status: "PENDING", simulated: true }));
    }
    async listOutbox(organizationId, opts = {}) {
        if (opts.status && !["PENDING", "SENT", "FAILED", "CANCELLED"].includes(opts.status))
            throw new errors_1.AppError(400, "INVALID_STATUS", "Unknown notification status");
        return this.db.notificationOutbox.findMany({
            where: {
                organizationId,
                ...(opts.status ? { status: opts.status } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: opts.limit ?? 50,
        });
    }
}
exports.CommunicationService = CommunicationService;
exports.communicationService = new CommunicationService();
