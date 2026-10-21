"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.siteService = exports.SiteService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const audit_service_1 = require("../audit/audit.service");
const siteSelect = {
    id: true,
    organizationId: true,
    heroTitle: true,
    heroSubtitle: true,
    aboutText: true,
    footerText: true,
    whatsapp: true,
    websiteUrl: true,
    facebookUrl: true,
    instagramUrl: true,
    twitterUrl: true,
    showResultsCta: true,
    showAbout: true,
    showContact: true,
    whyEyebrow: true,
    whyTitle: true,
    whyFeatures: true,
    createdAt: true,
    updatedAt: true,
};
class SiteService {
    async get(organizationId) {
        let site = await prisma_1.prisma.organizationSite.findUnique({
            where: { organizationId },
            select: siteSelect,
        });
        if (!site) {
            site = await prisma_1.prisma.organizationSite.create({
                data: { organizationId },
                select: siteSelect,
            });
        }
        return site;
    }
    async update(organizationId, actorId, input, requestId) {
        const org = await prisma_1.prisma.organization.findFirst({
            where: { id: organizationId, isActive: true },
            select: { id: true },
        });
        if (!org) {
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        }
        const site = await prisma_1.prisma.organizationSite.upsert({
            where: { organizationId },
            create: {
                organizationId,
                ...this.toData(input),
            },
            update: this.toData(input),
            select: siteSelect,
        });
        await audit_service_1.auditService.write({
            action: "SETTINGS_CHANGED",
            actorId,
            organizationId,
            entity: "OrganizationSite",
            entityId: site.id,
            metadata: { section: "site", fields: Object.keys(input) },
            requestId,
        });
        return site;
    }
    toData(input) {
        return {
            heroTitle: input.heroTitle === undefined ? undefined : input.heroTitle,
            heroSubtitle: input.heroSubtitle === undefined ? undefined : input.heroSubtitle,
            aboutText: input.aboutText === undefined ? undefined : input.aboutText,
            footerText: input.footerText === undefined ? undefined : input.footerText,
            whatsapp: input.whatsapp === undefined ? undefined : input.whatsapp,
            websiteUrl: input.websiteUrl === undefined ? undefined : input.websiteUrl,
            facebookUrl: input.facebookUrl === undefined ? undefined : input.facebookUrl,
            instagramUrl: input.instagramUrl === undefined ? undefined : input.instagramUrl,
            twitterUrl: input.twitterUrl === undefined ? undefined : input.twitterUrl,
            showResultsCta: input.showResultsCta,
            showAbout: input.showAbout,
            showContact: input.showContact,
            whyEyebrow: input.whyEyebrow === undefined ? undefined : input.whyEyebrow,
            whyTitle: input.whyTitle === undefined ? undefined : input.whyTitle,
            whyFeatures: input.whyFeatures === undefined
                ? undefined
                : input.whyFeatures ?? undefined,
        };
    }
}
exports.SiteService = SiteService;
exports.siteService = new SiteService();
