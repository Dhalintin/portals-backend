"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classService = void 0;
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function requireSchoolId(schoolId) {
    if (!schoolId) {
        throw new AppError_1.ForbiddenError("No school context");
    }
    return schoolId;
}
function displayName(name, arm) {
    return arm ? `${name}${arm}` : name; // "JSS 2" + "A" → "JSS 2A" — adjust if you prefer "JSS 2 A"
}
function toClassPublic(row) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        arm: row.arm,
        level: row.level,
        isActive: row.isActive,
        displayName: displayName(row.name, row.arm),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
/** Normalize arm for unique constraint (null vs undefined) */
function normalizeArm(arm) {
    if (arm === undefined || arm === null || arm === "")
        return null;
    return arm;
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
            }),
        ]);
        return {
            items: rows.map(toClassPublic),
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
        });
        if (!row) {
            throw new AppError_1.NotFoundError("Class not found");
        }
        return toClassPublic(row);
    },
    async create(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        const arm = normalizeArm(input.arm);
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
            return toClassPublic(row);
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
                    ...(input.arm !== undefined ? { arm: normalizeArm(input.arm) } : {}),
                    ...(input.level !== undefined ? { level: input.level } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                },
            });
            return toClassPublic(row);
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
        return toClassPublic(row);
    },
};
