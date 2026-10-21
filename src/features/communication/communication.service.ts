import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { schoolTransaction } from "../../lib/schoolTransaction";
import { enqueueAnnouncement } from "../../lib/notificationDelivery";
import { createHash } from "node:crypto";
import { AppError } from "../../lib/errors";
import { auditService } from "../audit/audit.service";

export class CommunicationService {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}
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

  async createAnnouncement(
    organizationId: string,
    data: {
      title: string;
      body: string;
      isPinned?: boolean;
      publishAt?: string | null;
      expiresAt?: string | null;
    },
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    return schoolTransaction(organizationId, tx => new CommunicationService(tx).createAnnouncementLocked(organizationId, data, actorId, meta));
  }
  private async createAnnouncementLocked(
    organizationId: string,
    data: {
      title: string;
      body: string;
      isPinned?: boolean;
      publishAt?: string | null;
      expiresAt?: string | null;
    },
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    const now = new Date();

    const publishAt = data.publishAt ? new Date(data.publishAt) : null;

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    if (publishAt && isNaN(publishAt.getTime())) {
      throw new AppError(400, "INVALID_DATE", "Invalid publish date");
    }

    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new AppError(400, "INVALID_DATE", "Invalid expiration date");
    }

    if (expiresAt && (expiresAt <= now || (publishAt && expiresAt <= publishAt))) {
      throw new AppError(400, "INVALID_DATE", "Expiration must follow publication and be in the future");
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

    if (announcement.isPublished) await enqueueAnnouncement(this.db, announcement);
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

  async publishAnnouncement(
    id: string,
    organizationId: string,
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    return schoolTransaction(organizationId, tx => new CommunicationService(tx).publishAnnouncementLocked(id, organizationId, actorId, meta));
  }
  private async publishAnnouncementLocked(
    id: string,
    organizationId: string,
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    const announcement = await this.db.announcement.findFirst({
      where: {
        id,
        organizationId,
        isActive: true,
      },
    });

    if (!announcement) {
      throw new AppError(404, "NOT_FOUND", "Announcement not found");
    }

    if (announcement.isPublished) {
      return announcement;
    }

    const now = new Date();

    if (announcement.expiresAt && announcement.expiresAt <= now) {
      throw new AppError(400, "ANNOUNCEMENT_EXPIRED", "This announcement has already expired");
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

    await enqueueAnnouncement(this.db, updated);
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
        const didPublish = await schoolTransaction(announcement.organizationId, async tx => {
          const dueNow = await tx.announcement.findFirst({ where: { id: announcement.id, organizationId: announcement.organizationId,
            isActive: true, isPublished: false, publishAt: { lte: new Date() }, organization: { isActive: true },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
          if (!dueNow) return false;
          await new CommunicationService(tx).publishAnnouncementLocked(announcement.id, announcement.organizationId, undefined);
          return true;
        });
        if (didPublish) published++;
      }
      catch (error) { if (!(error instanceof AppError && [400, 404].includes(error.statusCode))) throw error; }
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

  async listAnnouncements(
    organizationId: string,
    options: {
      isAdmin: boolean;
      activeOnly?: boolean;
      limit?: number;
    }
  ) {
    const { isAdmin, activeOnly = true, limit = 20 } = options;

    const now = new Date();

    const where: Prisma.AnnouncementWhereInput = {
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

  async getAnnouncement(id: string, organizationId: string, isAdmin: boolean) {
    const now = new Date();

    const where: Prisma.AnnouncementWhereInput = {
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

    return this.db.announcement.findFirst({
      where,
    });
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
  async updateAnnouncement(
    id: string,
    organizationId: string,
    data: {
      title?: string;
      body?: string;
      isPinned?: boolean;
      isActive?: boolean;
      publishAt?: string | null;
      expiresAt?: string | null;
    },
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    return schoolTransaction(organizationId, tx => new CommunicationService(tx).updateAnnouncementLocked(id, organizationId, data, actorId, meta));
  }
  private async updateAnnouncementLocked(
    id: string,
    organizationId: string,
    data: {
      title?: string;
      body?: string;
      isPinned?: boolean;
      isActive?: boolean;
      publishAt?: string | null;
      expiresAt?: string | null;
    },
    actorId: string | undefined,
    meta?: { requestId?: string }
  ) {
    const existing = await this.db.announcement.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Announcement not found");
    }

    const now = new Date();

    const publishAt =
      data.publishAt !== undefined
        ? data.publishAt
          ? new Date(data.publishAt)
          : null
        : existing.publishAt;

    const expiresAt =
      data.expiresAt !== undefined
        ? data.expiresAt
          ? new Date(data.expiresAt)
          : null
        : existing.expiresAt;

    if (publishAt && isNaN(publishAt.getTime())) {
      throw new AppError(400, "INVALID_DATE", "Invalid publish date");
    }

    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new AppError(400, "INVALID_DATE", "Invalid expiration date");
    }

    if (expiresAt && (expiresAt <= now || (publishAt && expiresAt <= publishAt))) {
      throw new AppError(400, "INVALID_DATE", "Expiration must follow publication and be in the future");
    }

    const shouldPublish =
      !existing.isPublished && publishAt !== null && publishAt <= now;

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

    if (shouldPublish) await enqueueAnnouncement(this.db, announcement);
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

  async deleteAnnouncement(
    organizationId: string,
    id: string,
    isAdmin: boolean
  ) {
    return schoolTransaction(organizationId, tx => new CommunicationService(tx).deleteAnnouncementLocked(organizationId, id, isAdmin));
  }
  private async deleteAnnouncementLocked(
    organizationId: string,
    id: string,
    isAdmin: boolean
  ) {
    const item = await this.db.announcement.findFirst({ where: { id, organizationId } });
    if (!item) throw new AppError(404, "NOT_FOUND", "Announcement not found");
    await this.db.notificationOutbox.updateMany({ where: { organizationId, entityType: "Announcement", entityId: id, status: "PENDING" },
      data: { status: "CANCELLED", lockedAt: null } });
    return this.db.announcement.update({ where: { id }, data: { isActive: false } });
  }
  // ─── Notification Outbox ───────────────────────────────────────
  async enqueue(
    organizationId: string,
    data: {
      type: NotificationType;
      recipient: string;
      channel?: string;
      title?: string;
      body: string;
      payload?: Record<string, any>;
      entityType?: string;
      entityId?: string;
      scheduledAt?: string;
      eventKey?: string;
    }
  ) {
    return schoolTransaction(organizationId, tx => new CommunicationService(tx).enqueueLocked(organizationId, data));
  }
  private async enqueueLocked(
    organizationId: string,
    data: {
      type: NotificationType;
      recipient: string;
      channel?: string;
      title?: string;
      body: string;
      payload?: Record<string, any>;
      entityType?: string;
      entityId?: string;
      scheduledAt?: string;
      eventKey?: string;
    }
  ) {
    const requestHash = createHash("sha256").update(JSON.stringify({ ...data, eventKey: undefined }, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest("hex");
    const eventKey = data.eventKey ?? requestHash;
    const existing = await this.db.notificationOutbox.findUnique({ where: { organizationId_eventKey: { organizationId, eventKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AppError(409, "EVENT_CONFLICT", "Notification key was used for another message");
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
  buildWhatsAppPayload(opts: {
    schoolName: string;
    recipientName?: string;
    type: NotificationType;
    data: Record<string, any>;
    deepLinkBase?: string;
  }) {
    const base =
      opts.deepLinkBase || process.env.APP_URL || "https://app.schoolos.ng";
    const link = (path: string) => `${base}${path}`;

    switch (opts.type) {
      case "PAYMENT_SUCCESS":
        return {
          text:
            `✅ Payment received – ${opts.schoolName}\n\n` +
            `Amount: ₦${Number(opts.data.amountNgn).toLocaleString()}\n` +
            (opts.data.receiptNumber
              ? `Receipt: ${opts.data.receiptNumber}\n`
              : "") +
            `\nView receipt: ${link(`/receipts/${opts.data.receiptId}`)}`,
          link: link(`/receipts/${opts.data.receiptId}`),
        };

      case "RECEIPT":
        return {
          text:
            `🧾 Receipt from ${opts.schoolName}\n` +
            `₦${Number(opts.data.amountNgn).toLocaleString()}\n` +
            `Ref: ${opts.data.receiptNumber}\n\n` +
            `${link(`/receipts/${opts.data.receiptId}`)}`,
          link: link(`/receipts/${opts.data.receiptId}`),
        };

      case "FEE_REMINDER":
        return {
          text:
            `📢 Fee reminder – ${opts.schoolName}\n\n` +
            `${opts.data.studentName} has an outstanding balance of ₦${Number(
              opts.data.outstandingNgn
            ).toLocaleString()}.\n\n` +
            `Pay now: ${link(`/fees/${opts.data.studentId}`)}`,
          link: link(`/fees/${opts.data.studentId}`),
        };

      case "RESULT_PUBLISHED":
        return {
          text:
            `📊 Results published – ${opts.schoolName}\n\n` +
            `${opts.data.studentName}'s results for ${opts.data.termName} are now available.\n\n` +
            `View: ${link(`/results/${opts.data.resultId}`)}`,
          link: link(`/results/${opts.data.resultId}`),
        };

      case "ATTENDANCE_ABSENCE":
        return {
          text:
            `⚠️ Attendance notice – ${opts.schoolName}\n\n` +
            `${opts.data.studentName} was marked ${opts.data.status} on ${opts.data.date}.\n` +
            (opts.data.note ? `Note: ${opts.data.note}\n` : "") +
            `\nView: ${link(`/attendance/${opts.data.studentId}`)}`,
          link: link(`/attendance/${opts.data.studentId}`),
        };

      case "ANNOUNCEMENT":
        return {
          text:
            `📢 ${opts.data.title}\n\n` +
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
  async notifyPaymentSuccess(
    organizationId: string,
    opts: {
      recipientPhone: string;
      amountNgn: number;
      receiptId?: string;
      receiptNumber?: string;
      studentName?: string;
    }
  ) {
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) return;

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

  async notifyResultPublished(
    organizationId: string,
    opts: {
      recipientPhone: string;
      studentName: string;
      termName: string;
      resultId: string;
    }
  ) {
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) return;

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

  async notifyAbsence(
    organizationId: string,
    opts: {
      recipientPhone: string;
      studentName: string;
      status: string;
      date: string;
      note?: string;
      studentId: string;
    }
  ) {
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) return;

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
  async processOutbox(limit = 20, organizationId?: string) {
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
  async listOutbox(
    organizationId: string,
    opts: { status?: string; limit?: number } = {}
  ) {
    if (opts.status && !["PENDING", "SENT", "FAILED", "CANCELLED"].includes(opts.status)) throw new AppError(400, "INVALID_STATUS", "Unknown notification status");
    return this.db.notificationOutbox.findMany({
      where: {
        organizationId,
        ...(opts.status ? { status: opts.status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 50,
    });
  }
}

export const communicationService = new CommunicationService();
