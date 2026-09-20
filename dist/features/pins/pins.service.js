"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinsService = exports.PinsService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma"); // adjust
const AppError_1 = require("../../common/errors/AppError");
const pins_codes_1 = require("./pins.codes");
function assertManager(actor) {
    const ok = actor.orgRole === client_1.OrgRole.SCHOOL_ADMIN ||
        actor.orgRole === client_1.OrgRole.EXAM_OFFICER ||
        actor.globalRole === "SUPER_ADMIN";
    if (!ok) {
        throw new AppError_1.ForbiddenError("Only school admin or exam officer can manage PIN cards");
    }
}
async function assertTermInOrg(termId, organizationId) {
    const term = await prisma_1.prisma.term.findFirst({
        where: { id: termId, session: { organizationId } },
        include: {
            session: { select: { id: true, name: true, organizationId: true } },
        },
    });
    if (!term)
        throw new AppError_1.NotFoundError("Term not found for this school");
    return term;
}
const pinListSelect = {
    id: true,
    code: true,
    organizationId: true,
    termId: true,
    studentId: true,
    status: true,
    usedAt: true,
    usedByIp: true,
    expiresAt: true,
    createdAt: true,
    term: {
        select: {
            id: true,
            name: true,
            session: { select: { id: true, name: true } },
        },
    },
    student: {
        select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
        },
    },
};
function toListItem(pin) {
    return {
        id: pin.id, // serial
        serial: pin.id,
        codeMasked: (0, pins_codes_1.maskPinCode)(pin.code),
        // Never return full code on list
        organizationId: pin.organizationId,
        termId: pin.termId,
        studentId: pin.studentId,
        status: pin.status,
        usedAt: pin.usedAt,
        usedByIp: pin.usedByIp,
        expiresAt: pin.expiresAt,
        createdAt: pin.createdAt,
        term: pin.term,
        student: pin.student,
    };
}
class PinsService {
    async list(organizationId, query) {
        const { termId, status, search, page, limit } = query;
        const skip = (page - 1) * limit;
        const where = {
            organizationId,
            ...(termId ? { termId } : {}),
            ...(status ? { status } : {}),
            ...(search?.trim()
                ? {
                    OR: [
                        { id: { startsWith: search.trim() } },
                        {
                            student: {
                                admissionNumber: {
                                    contains: search.trim(),
                                    mode: "insensitive",
                                },
                            },
                        },
                    ],
                }
                : {}),
        };
        const [rows, total] = await Promise.all([
            prisma_1.prisma.pin.findMany({
                where,
                select: pinListSelect,
                orderBy: { createdAt: "desc" },
                skip,
                take: Number(limit),
            }),
            prisma_1.prisma.pin.count({ where }),
        ]);
        return {
            items: rows.map(toListItem),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
    async stats(organizationId, query) {
        const base = {
            organizationId,
            ...(query.termId ? { termId: query.termId } : {}),
        };
        const [total, unused, used, expired, disabled] = await Promise.all([
            prisma_1.prisma.pin.count({ where: base }),
            prisma_1.prisma.pin.count({ where: { ...base, status: client_1.PinStatus.UNUSED } }),
            prisma_1.prisma.pin.count({ where: { ...base, status: client_1.PinStatus.USED } }),
            prisma_1.prisma.pin.count({ where: { ...base, status: client_1.PinStatus.EXPIRED } }),
            prisma_1.prisma.pin.count({ where: { ...base, status: client_1.PinStatus.DISABLED } }),
        ]);
        return {
            termId: query.termId ?? null,
            total,
            unused,
            used,
            expired,
            disabled,
        };
    }
    async getById(organizationId, id) {
        const pin = await prisma_1.prisma.pin.findFirst({
            where: { id, organizationId },
            select: pinListSelect,
        });
        if (!pin)
            throw new AppError_1.NotFoundError("PIN not found");
        return toListItem(pin);
    }
    /**
     * Generate N unique PIN cards for a term.
     * Returns full code + serial (id) ONCE for printing — not available again on list.
     */
    async generate(organizationId, body, actor) {
        assertManager(actor);
        await assertTermInOrg(body.termId, organizationId);
        if (body.studentId) {
            const student = await prisma_1.prisma.student.findFirst({
                where: {
                    id: body.studentId,
                    organizationId,
                    isActive: true,
                },
            });
            if (!student)
                throw new AppError_1.NotFoundError("Student not found");
        }
        if (body.expiresAt && body.expiresAt.getTime() < Date.now()) {
            throw new AppError_1.BadRequestError("Expiry must be in the future");
        }
        const quantity = body.quantity;
        const created = [];
        // Retry unique collisions on code
        const maxAttempts = quantity * 5;
        let attempts = 0;
        await prisma_1.prisma.$transaction(async (tx) => {
            while (created.length < quantity) {
                attempts += 1;
                if (attempts > maxAttempts) {
                    throw new AppError_1.BadRequestError("Could not generate enough unique PIN codes. Try a smaller batch.");
                }
                const code = (0, pins_codes_1.normalizePinCode)((0, pins_codes_1.generatePinCode)(12));
                try {
                    const pin = await tx.pin.create({
                        data: {
                            code,
                            organizationId,
                            termId: body.termId,
                            studentId: body.studentId ?? null,
                            status: client_1.PinStatus.UNUSED,
                            expiresAt: body.expiresAt ?? null,
                        },
                        select: { id: true, code: true },
                    });
                    created.push({
                        id: pin.id,
                        code: pin.code,
                        codeDisplay: (0, pins_codes_1.formatPinCodeDisplay)(pin.code),
                    });
                }
                catch (e) {
                    // Unique violation on code — retry
                    if (e &&
                        typeof e === "object" &&
                        "code" in e &&
                        e.code === "P2002") {
                        continue;
                    }
                    throw e;
                }
            }
        });
        return {
            termId: body.termId,
            quantity: created.length,
            /** Full secrets — print/PDF only; do not persist in frontend long-term */
            pins: created.map((p) => ({
                serial: p.id,
                id: p.id,
                code: p.code,
                codeDisplay: p.codeDisplay,
            })),
            generatedAt: new Date().toISOString(),
            warning: "Save or print these codes now. Full codes are not shown again in the admin list.",
        };
    }
    async update(organizationId, id, body, actor) {
        assertManager(actor);
        const pin = await prisma_1.prisma.pin.findFirst({
            where: { id, organizationId },
        });
        if (!pin)
            throw new AppError_1.NotFoundError("PIN not found");
        if (pin.status === client_1.PinStatus.USED && body.status === client_1.PinStatus.UNUSED) {
            throw new AppError_1.BadRequestError("A used PIN cannot be reset to unused");
        }
        if (body.studentId) {
            const student = await prisma_1.prisma.student.findFirst({
                where: { id: body.studentId, organizationId, isActive: true },
            });
            if (!student)
                throw new AppError_1.NotFoundError("Student not found");
        }
        const updated = await prisma_1.prisma.pin.update({
            where: { id },
            data: {
                ...(body.status !== undefined ? { status: body.status } : {}),
                ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
                ...(body.studentId !== undefined ? { studentId: body.studentId } : {}),
            },
            select: pinListSelect,
        });
        return toListItem(updated);
    }
    async disable(organizationId, id, actor) {
        return this.update(organizationId, id, { status: client_1.PinStatus.DISABLED }, actor);
    }
    /**
     * Parent verify: serial (Pin.id) + code must both match.
     * Marks UNUSED → USED on success. Returns published result only.
     */
    async verifyPublic(body, clientIp) {
        const org = await prisma_1.prisma.organization.findFirst({
            where: { slug: body.schoolSlug, isActive: true },
            select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                motto: true,
            },
        });
        if (!org)
            throw new AppError_1.NotFoundError("School not found");
        const student = await prisma_1.prisma.student.findFirst({
            where: {
                organizationId: org.id,
                admissionNumber: body.admissionNumber.trim(),
                isActive: true,
            },
        });
        // Generic errors — avoid leaking which field failed
        const invalid = () => {
            throw new AppError_1.BadRequestError("Invalid serial, PIN, or admission number");
        };
        if (!student)
            invalid();
        const pin = await prisma_1.prisma.pin.findFirst({
            where: {
                id: body.serial,
                organizationId: org.id,
            },
            include: {
                term: {
                    select: {
                        id: true,
                        name: true,
                        session: { select: { id: true, name: true } },
                    },
                },
            },
        });
        if (!pin)
            invalid();
        const submitted = (0, pins_codes_1.normalizePinCode)(body.pin);
        const stored = (0, pins_codes_1.normalizePinCode)(pin.code);
        if (submitted !== stored)
            invalid();
        if (pin.status === client_1.PinStatus.DISABLED) {
            throw new AppError_1.BadRequestError("This PIN card has been disabled");
        }
        if (pin.status === client_1.PinStatus.EXPIRED) {
            throw new AppError_1.BadRequestError("This PIN card has expired");
        }
        if (pin.expiresAt && pin.expiresAt < new Date()) {
            await prisma_1.prisma.pin.update({
                where: { id: pin.id },
                data: { status: client_1.PinStatus.EXPIRED },
            });
            throw new AppError_1.BadRequestError("This PIN card has expired");
        }
        // Pre-assigned card must match this student
        if (pin.studentId && pin.studentId !== student.id) {
            invalid();
        }
        // Already used: allow re-view only for the same bound student (optional policy)
        if (pin.status === client_1.PinStatus.USED) {
            if (pin.studentId && pin.studentId !== student.id) {
                throw new AppError_1.BadRequestError("This PIN card has already been used");
            }
            // If used but not bound, bind was set on first use — check studentId after first use
            if (pin.studentId === student.id || !pin.studentId) {
                // allow fetch if published (re-check)
            }
            else {
                throw new AppError_1.BadRequestError("This PIN card has already been used");
            }
        }
        const result = await prisma_1.prisma.result.findUnique({
            where: {
                studentId_termId: {
                    studentId: student.id,
                    termId: pin.termId,
                },
            },
            include: {
                student: {
                    select: {
                        id: true,
                        admissionNumber: true,
                        firstName: true,
                        lastName: true,
                        otherNames: true,
                        gender: true,
                        classId: true,
                    },
                },
                term: {
                    select: {
                        id: true,
                        name: true,
                        isCurrent: true,
                        session: { select: { id: true, name: true, isCurrent: true } },
                    },
                },
                class: {
                    select: { id: true, name: true, arm: true, level: true },
                },
                scores: {
                    include: {
                        subject: { select: { id: true, name: true, code: true } },
                    },
                    orderBy: { subject: { name: "asc" } },
                },
            },
        });
        if (!result || !result.isPublished) {
            throw new AppError_1.BadRequestError("Result is not available yet. Please check back after the school publishes this term.");
        }
        if (pin.status === client_1.PinStatus.UNUSED) {
            await prisma_1.prisma.pin.update({
                where: { id: pin.id },
                data: {
                    status: client_1.PinStatus.USED,
                    usedAt: new Date(),
                    usedByIp: clientIp ?? null,
                    studentId: pin.studentId ?? student.id,
                },
            });
        }
        return {
            school: org,
            term: pin.term,
            result,
        };
    }
}
exports.PinsService = PinsService;
exports.pinsService = new PinsService();
