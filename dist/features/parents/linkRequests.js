"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.childLinkRoutes = exports.childNameKey = exports.childLinkReview = exports.childLinkInput = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const http_1 = require("../../lib/http");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const rateLimit_1 = require("../../middlewares/rateLimit");
exports.childLinkInput = zod_1.z.object({ childName: zod_1.z.string().trim().min(3).max(160), className: zod_1.z.string().trim().max(80).optional(), note: zod_1.z.string().trim().max(500).optional() });
exports.childLinkReview = zod_1.z.discriminatedUnion('decision', [
    zod_1.z.object({ decision: zod_1.z.literal('APPROVED'), studentId: zod_1.z.string().uuid(), reviewNote: zod_1.z.string().trim().max(500).optional() }),
    zod_1.z.object({ decision: zod_1.z.literal('DECLINED'), reviewNote: zod_1.z.string().trim().min(3).max(500) })
]);
const childNameKey = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
exports.childNameKey = childNameKey;
async function ownParent(req) {
    if (req.auth?.orgRole !== 'PARENT' && !req.auth?.orgRoles?.includes('PARENT'))
        throw new errors_1.AppError(403, 'FORBIDDEN', 'Parent membership required');
    const parent = await prisma_1.prisma.parent.findFirst({ where: { organizationId: (0, requireSchool_1.getSchoolId)(req), userId: req.auth.userId, isActive: true }, select: { id: true } });
    if (!parent)
        throw new errors_1.AppError(403, 'NOT_A_PARENT', 'No active parent profile linked in this school');
    return parent;
}
exports.childLinkRoutes = (0, express_1.Router)();
exports.childLinkRoutes.get('/me/link-requests', async (req, res, next) => { try {
    const parent = await ownParent(req);
    (0, http_1.sendSuccess)(res, { items: await prisma_1.prisma.childLinkRequest.findMany({ where: { organizationId: (0, requireSchool_1.getSchoolId)(req), parentId: parent.id }, orderBy: { createdAt: 'desc' }, take: 100 }) });
}
catch (e) {
    next(e);
} });
exports.childLinkRoutes.post('/me/link-requests', rateLimit_1.invitationLimiter, async (req, res, next) => {
    try {
        const parent = await ownParent(req), input = exports.childLinkInput.parse(req.body), organizationId = (0, requireSchool_1.getSchoolId)(req);
        const where = { parentId_childKey: { parentId: parent.id, childKey: (0, exports.childNameKey)(input.childName) } };
        // A unique name key makes retries safe after a lost response.
        const request = await prisma_1.prisma.childLinkRequest.upsert({ where, create: { ...input, organizationId, parentId: parent.id, childKey: where.parentId_childKey.childKey }, update: {} });
        (0, http_1.sendSuccess)(res, request, 201);
    }
    catch (e) {
        next(e);
    }
});
exports.childLinkRoutes.get('/link-requests', (0, requirePermission_1.requirePermission)('parents:write'), async (req, res, next) => {
    try {
        const page = zod_1.z.coerce.number().int().min(1).parse(req.query.page ?? 1), where = { organizationId: (0, requireSchool_1.getSchoolId)(req), status: 'PENDING', parent: { isActive: true } };
        const [items, total] = await Promise.all([prisma_1.prisma.childLinkRequest.findMany({ where, include: { parent: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } }, orderBy: { createdAt: 'asc' }, skip: (page - 1) * 25, take: 25 }), prisma_1.prisma.childLinkRequest.count({ where })]);
        (0, http_1.sendSuccess)(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / 25)) });
    }
    catch (e) {
        next(e);
    }
});
exports.childLinkRoutes.post('/link-requests/:id/review', (0, requirePermission_1.requirePermission)('parents:write'), async (req, res, next) => {
    try {
        const id = zod_1.z.string().uuid().parse(req.params.id), input = exports.childLinkReview.parse(req.body), organizationId = (0, requireSchool_1.getSchoolId)(req);
        const value = await prisma_1.prisma.$transaction(async (tx) => {
            const request = await tx.childLinkRequest.findFirst({ where: { id, organizationId, parent: { organizationId, isActive: true } } });
            if (!request)
                throw new errors_1.AppError(404, 'NOT_FOUND', 'Child-link request not found');
            if (request.status !== 'PENDING')
                throw new errors_1.AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed. Refresh the list.');
            if (input.decision === 'APPROVED') {
                const student = await tx.student.findFirst({ where: { id: input.studentId, organizationId, isActive: true }, select: { id: true } });
                if (!student)
                    throw new errors_1.AppError(404, 'NOT_FOUND', 'Choose an active student in this school');
            }
            const updated = await tx.childLinkRequest.updateMany({ where: { id, organizationId, status: 'PENDING' }, data: { status: input.decision, reviewNote: input.reviewNote ?? null, reviewerId: req.auth.userId, reviewedAt: new Date(), studentId: input.decision === 'APPROVED' ? input.studentId : null } });
            if (updated.count !== 1)
                throw new errors_1.AppError(409, 'ALREADY_REVIEWED', 'Another administrator has reviewed this request.');
            if (input.decision === 'APPROVED')
                await tx.parentStudent.upsert({ where: { parentId_studentId: { parentId: request.parentId, studentId: input.studentId } }, create: { organizationId, parentId: request.parentId, studentId: input.studentId, isPrimary: false }, update: {} });
            return { id, status: input.decision };
        });
        (0, http_1.sendSuccess)(res, value);
    }
    catch (e) {
        next(e);
    }
});
