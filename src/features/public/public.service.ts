import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";

export class PublicService {
  /**
   * Public brand + site content by slug.
   * Only returns data for active schools.
   */
  async getBrandBySlug(slug: string) {
    const school = await prisma.organization.findFirst({
      where: {
        slug,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        motto: true,
        schoolType: true,
        address: true,
        city: true,
        state: true,
        country: true,
        phone: true,
        email: true,
        site: {
          select: {
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
          },
        },
      },
    });

    if (!school) {
      throw new AppError(404, "SCHOOL_NOT_FOUND", "School not found");
    }

    return school;
  }

  /**
   * Optional public directory of active schools.
   * Only shows basic public info — never internal data.
   */
  async listPublicSchools(query: {
    search?: string;
    state?: string;
    limit?: number;
    cursor?: string;
  }) {
    const where: Prisma.OrganizationWhereInput = {
      isActive: true,
      onBoarded: true, // only show schools that finished basic setup
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
        { city: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.state) {
      where.state = { equals: query.state, mode: "insensitive" };
    }

    const schools = await prisma.organization.findMany({
      where,
      take: query.limit ?? 20,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        city: true,
        state: true,
        motto: true,
        schoolType: true,
      },
    });

    return schools;
  }

  /**
   * Lightweight health/info for the public site of a school.
   * Useful for the frontend to know whether the mini-site is enabled.
   */
  async getSiteStatus(slug: string) {
    const school = await prisma.organization.findFirst({
      where: { slug, isActive: true },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        site: {
          select: {
            showAbout: true,
            showContact: true,
            showResultsCta: true,
          },
        },
      },
    });

    if (!school) {
      throw new AppError(404, "SCHOOL_NOT_FOUND", "School not found");
    }

    return {
      exists: true,
      name: school.name,
      slug: school.slug,
      logoUrl: school.logoUrl,
      primaryColor: school.primaryColor,
      accentColor: school.accentColor,
      features: school.site ?? {
        showAbout: true,
        showContact: true,
        showResultsCta: true,
      },
    };
  }
}

export const publicService = new PublicService();
