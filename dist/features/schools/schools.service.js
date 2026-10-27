"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolsService = exports.SchoolsService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const audit_service_1 = require("../audit/audit.service");
const onboarding_1 = require("./onboarding");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const schoolSelect = {
    id: true,
    name: true,
    slug: true,
    email: true,
    phone: true,
    logoUrl: true,
    primaryColor: true,
    accentColor: true,
    address: true,
    city: true,
    state: true,
    country: true,
    motto: true,
    schoolType: true,
    isActive: true,
    onBoarded: true,
    createdAt: true,
    updatedAt: true,
};
class SchoolsService {
    async getOnboarding(organizationId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => (0, onboarding_1.onboardingChecklist)(tx, organizationId));
    }
    async getProfile(organizationId) {
        const school = await prisma_1.prisma.organization.findFirst({
            where: { id: organizationId, isActive: true },
            select: schoolSelect,
        });
        if (!school) {
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        }
        return school;
    }
    async updateProfile(organizationId, actorId, input, requestId) {
        await this.getProfile(organizationId);
        if (input.email) {
            const taken = await prisma_1.prisma.organization.findFirst({
                where: {
                    email: input.email,
                    NOT: { id: organizationId },
                },
                select: { id: true },
            });
            if (taken) {
                throw new errors_1.AppError(409, "EMAIL_IN_USE", "School email already in use");
            }
        }
        const school = await prisma_1.prisma.organization.update({
            where: { id: organizationId },
            data: {
                name: input.name,
                email: input.email === undefined ? undefined : input.email,
                phone: input.phone === undefined ? undefined : input.phone,
                address: input.address === undefined ? undefined : input.address,
                city: input.city === undefined ? undefined : input.city,
                state: input.state === undefined ? undefined : input.state,
                country: input.country,
                motto: input.motto === undefined ? undefined : input.motto,
                schoolType: input.schoolType === undefined ? undefined : input.schoolType,
            },
            select: schoolSelect,
        });
        await audit_service_1.auditService.write({
            action: "SETTINGS_CHANGED",
            actorId,
            organizationId,
            entity: "Organization",
            entityId: organizationId,
            metadata: { section: "profile", fields: Object.keys(input) },
            requestId,
        });
        return school;
    }
    async updateBranding(organizationId, actorId, input, requestId) {
        await this.getProfile(organizationId);
        const school = await prisma_1.prisma.organization.update({
            where: { id: organizationId },
            data: {
                logoUrl: input.logoUrl === undefined ? undefined : input.logoUrl,
                primaryColor: input.primaryColor,
                accentColor: input.accentColor,
            },
            select: schoolSelect,
        });
        await audit_service_1.auditService.write({
            action: "SETTINGS_CHANGED",
            actorId,
            organizationId,
            entity: "Organization",
            entityId: organizationId,
            metadata: { section: "branding", fields: Object.keys(input) },
            requestId,
        });
        return school;
    }
    async updateSlug(organizationId, actorId, slug, requestId) {
        await this.getProfile(organizationId);
        const taken = await prisma_1.prisma.organization.findFirst({
            where: { slug, NOT: { id: organizationId } },
            select: { id: true },
        });
        if (taken) {
            throw new errors_1.AppError(409, "SLUG_IN_USE", "This school URL is already taken");
        }
        const school = await prisma_1.prisma.organization.update({
            where: { id: organizationId },
            data: { slug },
            select: schoolSelect,
        });
        await audit_service_1.auditService.write({
            action: "SETTINGS_CHANGED",
            actorId,
            organizationId,
            entity: "Organization",
            entityId: organizationId,
            metadata: { section: "slug", slug },
            requestId,
        });
        return school;
    }
    async completeOnboarding(organizationId, actorId) {
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            const checklist = await (0, onboarding_1.onboardingChecklist)(tx, organizationId);
            if (checklist.completed)
                return tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: schoolSelect });
            if (!checklist.readyForCompletion) {
                throw new errors_1.AppError(400, "ONBOARDING_INCOMPLETE", "Complete the missing onboarding steps", checklist);
            }
            const school = await tx.organization.update({ where: { id: organizationId },
                data: { onBoarded: true }, select: schoolSelect });
            if (!checklist.completed)
                await tx.auditLog.create({ data: { action: "SETTINGS_CHANGED", actorId, organizationId,
                        entity: "Organization", entityId: organizationId, metadata: { section: "onboarding", onBoarded: true } } });
            return school;
        });
    }
}
exports.SchoolsService = SchoolsService;
exports.schoolsService = new SchoolsService();
// // src/features/schools/school.service.ts
// import { prisma } from "../../lib/prisma";
// import {
//   ForbiddenError,
//   NotFoundError,
//   UnauthorizedError,
// } from "../../common/errors/AppError";
// import type { UpdateSchoolBody } from "./school.dto";
// import type { SchoolPublic } from "./school.types";
// import type { Organization } from "@prisma/client";
// import { toSchoolPublic } from "../../utils/toPublic";
// function requireSchoolId(schoolId: string | null | undefined): string {
//   if (!schoolId) {
//     throw new ForbiddenError(
//       "No school context. Select or create a school first."
//     );
//   }
//   return schoolId;
// }
// export const schoolService = {
//   async getMe(schoolId: string | null | undefined) {
//     const id = requireSchoolId(schoolId);
//     const org = await prisma.organization.findFirst({
//       where: { id, isActive: true },
//     });
//     if (!org) {
//       throw new NotFoundError("School not found");
//     }
//     return toSchoolPublic(org);
//   },
//   async updateMe(
//     schoolId: string | null | undefined,
//     userId: string | undefined,
//     input: UpdateSchoolBody
//   ) {
//     if (!userId) throw new UnauthorizedError();
//     const id = requireSchoolId(schoolId);
//     const org = await prisma.organization.findFirst({
//       where: { id, isActive: true },
//     });
//     if (!org) {
//       throw new NotFoundError("School not found");
//     }
//     // Only school_admin (and exam_officer if you want) should PATCH — enforced in routes
//     const updated = await prisma.organization.update({
//       where: { id },
//       data: {
//         ...(input.name !== undefined ? { name: input.name } : {}),
//         ...(input.email !== undefined ? { email: input.email } : {}),
//         ...(input.phone !== undefined ? { phone: input.phone } : {}),
//         ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
//         ...(input.primaryColor !== undefined
//           ? { primaryColor: input.primaryColor }
//           : {}),
//         ...(input.accentColor !== undefined
//           ? { accentColor: input.accentColor }
//           : {}),
//         ...(input.address !== undefined ? { address: input.address } : {}),
//         ...(input.city !== undefined ? { city: input.city } : {}),
//         ...(input.state !== undefined ? { state: input.state } : {}),
//         ...(input.country !== undefined ? { country: input.country } : {}),
//         ...(input.motto !== undefined ? { motto: input.motto } : {}),
//         ...(input.schoolType !== undefined
//           ? { schoolType: input.schoolType }
//           : {}),
//       },
//     });
//     return toSchoolPublic(updated);
//   },
// };
