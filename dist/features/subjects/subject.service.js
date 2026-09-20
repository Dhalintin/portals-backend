"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectService = void 0;
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function requireSchoolId(schoolId) {
    if (!schoolId)
        throw new AppError_1.ForbiddenError("No school context");
    return schoolId;
}
function toSubjectPublic(row) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        code: row.code,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function isUniqueViolation(err) {
    return (typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "P2002");
}
exports.subjectService = {
    async list(schoolId, query) {
        const organizationId = requireSchoolId(schoolId);
        const where = { organizationId };
        if (query.isActive === "true")
            where.isActive = true;
        if (query.isActive === "false")
            where.isActive = false;
        if (query.search?.trim()) {
            const q = query.search.trim();
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
            ];
        }
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const skip = (page - 1) * pageSize;
        const [total, rows] = await Promise.all([
            prisma_1.prisma.subject.count({ where }),
            prisma_1.prisma.subject.findMany({
                where,
                orderBy: { name: "asc" },
                skip,
                take: Number(pageSize),
            }),
        ]);
        return {
            items: rows.map(toSubjectPublic),
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
        const row = await prisma_1.prisma.subject.findFirst({
            where: { id, organizationId },
        });
        if (!row)
            throw new AppError_1.NotFoundError("Subject not found");
        return toSubjectPublic(row);
    },
    async create(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        try {
            const row = await prisma_1.prisma.subject.create({
                data: {
                    organizationId,
                    name: input.name,
                    code: input.code ?? null,
                    isActive: true,
                },
            });
            return toSubjectPublic(row);
        }
        catch (err) {
            if (isUniqueViolation(err)) {
                throw new AppError_1.ConflictError("A subject with this name already exists in your school");
            }
            throw err;
        }
    },
    async update(schoolId, id, input) {
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.subject.findFirst({
            where: { id, organizationId },
        });
        if (!existing)
            throw new AppError_1.NotFoundError("Subject not found");
        try {
            const row = await prisma_1.prisma.subject.update({
                where: { id },
                data: {
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.code !== undefined ? { code: input.code } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                },
            });
            return toSubjectPublic(row);
        }
        catch (err) {
            if (isUniqueViolation(err)) {
                throw new AppError_1.ConflictError("A subject with this name already exists in your school");
            }
            throw err;
        }
    },
    async remove(schoolId, id) {
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.subject.findFirst({
            where: { id, organizationId },
        });
        if (!existing)
            throw new AppError_1.NotFoundError("Subject not found");
        const row = await prisma_1.prisma.subject.update({
            where: { id },
            data: { isActive: false },
        });
        return toSubjectPublic(row);
    },
};
