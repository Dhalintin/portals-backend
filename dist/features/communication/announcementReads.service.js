"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishedNotices = publishedNotices;
exports.withReadStatus = withReadStatus;
exports.unreadAnnouncements = unreadAnnouncements;
exports.markAnnouncementRead = markAnnouncementRead;
const prisma_1 = require("../../lib/prisma");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const errors_1 = require("../../lib/errors");
function publishedNotices(organizationId) {
    return { organizationId, isActive: true, isPublished: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}
async function withReadStatus(items, userId) {
    if (!items.length)
        return [];
    const reads = await prisma_1.prisma.announcementRead.findMany({ where: { userId, announcementId: { in: items.map(item => item.id) } }, select: { announcementId: true, readAt: true } });
    const byId = new Map(reads.map(read => [read.announcementId, read.readAt]));
    return items.map(item => ({ ...item, readAt: byId.get(item.id) ?? null }));
}
async function unreadAnnouncements(organizationId, userId) {
    const where = { ...publishedNotices(organizationId), reads: { none: { userId } } };
    const [count, items] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.announcement.count({ where }),
        prisma_1.prisma.announcement.findMany({ where, select: { id: true, title: true, publishedAt: true, isPinned: true }, orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { id: "asc" }], take: 20 }),
    ], { isolationLevel: "RepeatableRead" });
    return { count, items };
}
async function markAnnouncementRead(organizationId, userId, id) {
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const notice = await tx.announcement.findFirst({ where: { id, ...publishedNotices(organizationId) }, select: { id: true } });
        if (!notice)
            throw new errors_1.AppError(404, "NOT_FOUND", "Announcement not found");
        return tx.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId } }, create: { announcementId: id, userId }, update: {}, select: { announcementId: true, readAt: true } });
    });
}
