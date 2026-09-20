"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classService = void 0;
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
const normalization_1 = require("../../utils/normalization");
const toPublic_1 = require("../../utils/toPublic");
function requireSchoolId(schoolId) {
    if (!schoolId) {
        throw new AppError_1.ForbiddenError("No school context");
    }
    return schoolId;
}
exports.classService = {
    async list(schoolId, query) {
        const organizationId = requireSchoolId(schoolId);
        const where = {
            organizationId,
        };
        if (query.isActive === "true")
            where.isActive = true;
        if (query.isActive === "false")
            where.isActive = false;
        // "all" → no isActive filter
        if (query.level) {
            where.level = query.level;
        }
        if (query.search) {
            const q = query.search.trim();
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { arm: { contains: q, mode: "insensitive" } },
                { level: { contains: q, mode: "insensitive" } },
            ];
        }
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const skip = (page - 1) * pageSize;
        const [total, rows] = await Promise.all([
            prisma_1.prisma.class.count({ where }),
            prisma_1.prisma.class.findMany({
                where,
                orderBy: [{ name: "asc" }, { arm: "asc" }],
                skip,
                take: pageSize,
                include: {
                    classTeacher: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            }),
        ]);
        return {
            items: rows.map(toPublic_1.toClassPublic),
            meta: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize) || 1,
            },
        };
    },
    async getById(schoolId, id) {
        const organizationId = requireSchoolId(schoolId);
        const row = await prisma_1.prisma.class.findFirst({
            where: { id, organizationId },
            include: {
                classTeacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
        if (!row) {
            throw new AppError_1.NotFoundError("Class not found");
        }
        return (0, toPublic_1.toClassPublic)(row);
    },
    async create(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        const arm = (0, normalization_1.normalizeArm)(input.arm);
        try {
            const row = await prisma_1.prisma.class.create({
                data: {
                    organizationId,
                    name: input.name,
                    arm,
                    level: input.level ?? null,
                    isActive: true,
                },
            });
            return (0, toPublic_1.toClassPublic)(row);
        }
        catch (err) {
            // Unique: @@unique([organizationId, name, arm])
            if (typeof err === "object" &&
                err !== null &&
                "code" in err &&
                err.code === "P2002") {
                throw new AppError_1.ConflictError("A class with this name and arm already exists in your school");
            }
            throw err;
        }
    },
    async update(schoolId, id, input) {
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.class.findFirst({
            where: { id, organizationId },
        });
        if (!existing) {
            throw new AppError_1.NotFoundError("Class not found");
        }
        try {
            const row = await prisma_1.prisma.class.update({
                where: { id },
                data: {
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.arm !== undefined ? { arm: (0, normalization_1.normalizeArm)(input.arm) } : {}),
                    ...(input.level !== undefined ? { level: input.level } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                },
            });
            return (0, toPublic_1.toClassPublic)(row);
        }
        catch (err) {
            if (typeof err === "object" &&
                err !== null &&
                "code" in err &&
                err.code === "P2002") {
                throw new AppError_1.ConflictError("A class with this name and arm already exists in your school");
            }
            throw err;
        }
    },
    /** Soft-delete by default */
    async remove(schoolId, id) {
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.class.findFirst({
            where: { id, organizationId },
        });
        if (!existing) {
            throw new AppError_1.NotFoundError("Class not found");
        }
        const row = await prisma_1.prisma.class.update({
            where: { id },
            data: { isActive: false },
        });
        return (0, toPublic_1.toClassPublic)(row);
    },
};
