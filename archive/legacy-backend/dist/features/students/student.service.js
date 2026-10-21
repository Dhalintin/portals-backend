"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentService = void 0;
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function requireSchoolId(schoolId) {
    if (!schoolId) {
        throw new AppError_1.ForbiddenError("No school context");
    }
    return schoolId;
}
function classDisplayName(name, arm) {
    return arm ? `${name}${arm}` : name;
}
function toStudentPublic(row) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        admissionNumber: row.admissionNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        otherNames: row.otherNames,
        fullName: [row.firstName, row.otherNames, row.lastName]
            .filter(Boolean)
            .join(" "),
        gender: row.gender,
        classId: row.classId,
        class: row.class
            ? {
                id: row.class.id,
                name: row.class.name,
                arm: row.class.arm,
                level: row.class.level,
                displayName: classDisplayName(row.class.name, row.class.arm),
            }
            : null,
        parentPhone: row.parentPhone,
        parentEmail: row.parentEmail,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
async function assertClassInSchool(organizationId, classId) {
    if (!classId)
        return;
    const cls = await prisma_1.prisma.class.findFirst({
        where: { id: classId, organizationId, isActive: true },
    });
    if (!cls) {
        throw new AppError_1.BadRequestError("Class not found in this school");
    }
}
/** e.g. ADM-2026-0001 */
async function generateAdmissionNumber(organizationId) {
    const year = new Date().getFullYear();
    const prefix = `ADM-${year}-`;
    const latest = await prisma_1.prisma.student.findFirst({
        where: {
            organizationId,
            admissionNumber: { startsWith: prefix },
        },
        orderBy: { admissionNumber: "desc" },
        select: { admissionNumber: true },
    });
    let next = 1;
    if (latest?.admissionNumber) {
        const tail = latest.admissionNumber.slice(prefix.length);
        const n = parseInt(tail, 10);
        if (!Number.isNaN(n))
            next = n + 1;
    }
    // retry-safe unique attempts
    for (let i = 0; i < 20; i++) {
        const candidate = `${prefix}${String(next + i).padStart(4, "0")}`;
        const exists = await prisma_1.prisma.student.findFirst({
            where: { organizationId, admissionNumber: candidate },
            select: { id: true },
        });
        if (!exists)
            return candidate;
    }
    return `${prefix}${Date.now().toString().slice(-6)}`;
}
function isPrismaUniqueViolation(err) {
    return (typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "P2002");
}
exports.studentService = {
    async list(schoolId, query) {
        console.log("here 1");
        const organizationId = requireSchoolId(schoolId);
        const where = { organizationId };
        if (query.isActive === "true")
            where.isActive = true;
        if (query.isActive === "false")
            where.isActive = false;
        if (query.classId)
            where.classId = query.classId;
        if (query.gender)
            where.gender = query.gender;
        if (query.search?.trim()) {
            const q = query.search.trim();
            where.OR = [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { otherNames: { contains: q, mode: "insensitive" } },
                { admissionNumber: { contains: q, mode: "insensitive" } },
                { parentPhone: { contains: q, mode: "insensitive" } },
                { parentEmail: { contains: q, mode: "insensitive" } },
            ];
        }
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const skip = (page - 1) * pageSize;
        const [total, rows] = await Promise.all([
            prisma_1.prisma.student.count({ where }),
            prisma_1.prisma.student.findMany({
                where,
                include: { class: true },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
                skip,
                take: Number(pageSize),
            }),
        ]);
        return {
            items: rows.map(toStudentPublic),
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
        const row = await prisma_1.prisma.student.findFirst({
            where: { id, organizationId },
            include: { class: true },
        });
        if (!row)
            throw new AppError_1.NotFoundError("Student not found");
        return toStudentPublic(row);
    },
    async create(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        await assertClassInSchool(organizationId, input.classId);
        let admissionNumber = input.admissionNumber?.trim() ||
            (await generateAdmissionNumber(organizationId));
        try {
            const row = await prisma_1.prisma.student.create({
                data: {
                    organizationId,
                    admissionNumber,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    otherNames: input.otherNames ?? null,
                    gender: input.gender ?? null,
                    classId: input.classId ?? null,
                    parentPhone: input.parentPhone ?? null,
                    parentEmail: input.parentEmail ?? null,
                    isActive: true,
                },
                include: { class: true },
            });
            return toStudentPublic(row);
        }
        catch (err) {
            if (isPrismaUniqueViolation(err)) {
                throw new AppError_1.ConflictError("A student with this admission number already exists in your school");
            }
            throw err;
        }
    },
    async update(schoolId, id, input) {
        console.log("Final stage updating");
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.student.findFirst({
            where: { id, organizationId },
        });
        if (!existing)
            throw new AppError_1.NotFoundError("Student not found");
        if (input.classId !== undefined) {
            await assertClassInSchool(organizationId, input.classId);
        }
        try {
            const row = await prisma_1.prisma.student.update({
                where: { id },
                data: {
                    ...(input.firstName !== undefined
                        ? { firstName: input.firstName }
                        : {}),
                    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
                    ...(input.otherNames !== undefined
                        ? { otherNames: input.otherNames }
                        : {}),
                    ...(input.admissionNumber !== undefined
                        ? { admissionNumber: input.admissionNumber }
                        : {}),
                    ...(input.gender !== undefined ? { gender: input.gender } : {}),
                    ...(input.classId !== undefined ? { classId: input.classId } : {}),
                    ...(input.parentPhone !== undefined
                        ? { parentPhone: input.parentPhone }
                        : {}),
                    ...(input.parentEmail !== undefined
                        ? { parentEmail: input.parentEmail }
                        : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                },
                include: { class: true },
            });
            return toStudentPublic(row);
        }
        catch (err) {
            if (isPrismaUniqueViolation(err)) {
                throw new AppError_1.ConflictError("A student with this admission number already exists in your school");
            }
            throw err;
        }
    },
    async remove(schoolId, id) {
        const organizationId = requireSchoolId(schoolId);
        const existing = await prisma_1.prisma.student.findFirst({
            where: { id, organizationId },
        });
        if (!existing)
            throw new AppError_1.NotFoundError("Student not found");
        const row = await prisma_1.prisma.student.update({
            where: { id },
            data: { isActive: false },
            include: { class: true },
        });
        return toStudentPublic(row);
    },
    /**
     * Best-effort bulk create.
     * Returns created items + per-row errors (does not abort the whole batch).
     */
    async bulkCreate(schoolId, input) {
        const organizationId = requireSchoolId(schoolId);
        const created = [];
        const errors = [];
        for (let i = 0; i < input.students.length; i++) {
            const row = input.students[i];
            try {
                const student = await this.create(organizationId, row);
                // create() expects schoolId; organizationId is the same value
                created.push(student);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : "Failed to create student";
                errors.push({ index: i, message });
            }
        }
        return {
            created,
            errors,
            meta: {
                total: input.students.length,
                successCount: created.length,
                errorCount: errors.length,
            },
        };
    },
};
