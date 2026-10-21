import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { auditService } from "../audit/audit.service";
import type { UpdateSiteInput } from "./site.validation";

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
} as const;

export class SiteService {
  async get(organizationId: string) {
    let site = await prisma.organizationSite.findUnique({
      where: { organizationId },
      select: siteSelect,
    });

    if (!site) {
      site = await prisma.organizationSite.create({
        data: { organizationId },
        select: siteSelect,
      });
    }

    return site;
  }

  async update(
    organizationId: string,
    actorId: string,
    input: UpdateSiteInput,
    requestId?: string
  ) {
    const org = await prisma.organization.findFirst({
      where: { id: organizationId, isActive: true },
      select: { id: true },
    });
    if (!org) {
      throw new AppError(404, "SCHOOL_NOT_FOUND", "School not found");
    }

    const site = await prisma.organizationSite.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...this.toData(input),
      },
      update: this.toData(input),
      select: siteSelect,
    });

    await auditService.write({
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

  private toData(input: UpdateSiteInput) {
    return {
      heroTitle: input.heroTitle === undefined ? undefined : input.heroTitle,
      heroSubtitle:
        input.heroSubtitle === undefined ? undefined : input.heroSubtitle,
      aboutText: input.aboutText === undefined ? undefined : input.aboutText,
      footerText: input.footerText === undefined ? undefined : input.footerText,
      whatsapp: input.whatsapp === undefined ? undefined : input.whatsapp,
      websiteUrl: input.websiteUrl === undefined ? undefined : input.websiteUrl,
      facebookUrl:
        input.facebookUrl === undefined ? undefined : input.facebookUrl,
      instagramUrl:
        input.instagramUrl === undefined ? undefined : input.instagramUrl,
      twitterUrl: input.twitterUrl === undefined ? undefined : input.twitterUrl,
      showResultsCta: input.showResultsCta,
      showAbout: input.showAbout,
      showContact: input.showContact,
      whyEyebrow: input.whyEyebrow === undefined ? undefined : input.whyEyebrow,
      whyTitle: input.whyTitle === undefined ? undefined : input.whyTitle,
      whyFeatures:
        input.whyFeatures === undefined
          ? undefined
          : input.whyFeatures ?? undefined,
    };
  }
}

export const siteService = new SiteService();
