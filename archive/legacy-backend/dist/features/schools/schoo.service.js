"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolService = void 0;
// src/features/schools/school.service.ts
const prisma_1 = require("../../lib/prisma");
const AppError_1 = require("../../common/errors/AppError");
function toSchoolPublic(org) {
    return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        motto: org.motto,
        schoolType: org.schoolType,
        isActive: org.isActive,
        onBoarded: org.onBoarded,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
    };
}
function requireSchoolId(schoolId) {
    if (!schoolId) {
        throw new AppError_1.ForbiddenError("No school context. Select or create a school first.");
    }
    return schoolId;
}
exports.schoolService = {
    async getMe(schoolId) {
        const id = requireSchoolId(schoolId);
        const org = await prisma_1.prisma.organization.findFirst({
            where: { id, isActive: true },
        });
        if (!org) {
            throw new AppError_1.NotFoundError("School not found");
        }
        return toSchoolPublic(org);
    },
    async updateMe(schoolId, userId, input) {
        if (!userId)
            throw new AppError_1.UnauthorizedError();
        const id = requireSchoolId(schoolId);
        const org = await prisma_1.prisma.organization.findFirst({
            where: { id, isActive: true },
        });
        if (!org) {
            throw new AppError_1.NotFoundError("School not found");
        }
        // Only school_admin (and exam_officer if you want) should PATCH — enforced in routes
        const updated = await prisma_1.prisma.organization.update({
            where: { id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.email !== undefined ? { email: input.email } : {}),
                ...(input.phone !== undefined ? { phone: input.phone } : {}),
                ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
                ...(input.primaryColor !== undefined
                    ? { primaryColor: input.primaryColor }
                    : {}),
                ...(input.accentColor !== undefined
                    ? { accentColor: input.accentColor }
                    : {}),
                ...(input.address !== undefined ? { address: input.address } : {}),
                ...(input.city !== undefined ? { city: input.city } : {}),
                ...(input.state !== undefined ? { state: input.state } : {}),
                ...(input.country !== undefined ? { country: input.country } : {}),
                ...(input.motto !== undefined ? { motto: input.motto } : {}),
                ...(input.schoolType !== undefined
                    ? { schoolType: input.schoolType }
                    : {}),
            },
        });
        return toSchoolPublic(updated);
    },
};
