import { Prisma } from "@prisma/client";
import { ListPublicSchoolsQuery } from "../dto";
import { prisma } from "../../../lib/prisma";

/** Fields safe for unauthenticated consumers (picker, marketing). */
const publicSchoolSelect = {
  name: true,
  slug: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
  city: true,
  state: true,
  schoolType: true,
} satisfies Prisma.OrganizationSelect;

export class PublicSchoolsService {
  async list(query: ListPublicSchoolsQuery) {
    const { q, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationWhereInput = {
      isActive: true,
      // Only schools that are usable on the public surface
      onBoarded: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { state: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        select: publicSchoolSelect,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.organization.count({ where }),
    ]);

    return {
      items: rows.map((s) => ({
        name: s.name,
        slug: s.slug,
        logoUrl: s.logoUrl,
        primaryColor: s.primaryColor,
        accentColor: s.accentColor,
        city: s.city,
        state: s.state,
        schoolType: s.schoolType,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /** Optional single lookup by slug (public card). */
  async getBySlug(slug: string) {
    const s = await prisma.organization.findFirst({
      where: {
        slug: slug.toLowerCase().trim(),
        isActive: true,
      },
      select: publicSchoolSelect,
    });
    if (!s) return null;
    return {
      name: s.name,
      slug: s.slug,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      city: s.city,
      state: s.state,
      schoolType: s.schoolType,
    };
  }
}
