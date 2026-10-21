import { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma"; // adjust
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError"; // adjust
import type {
  UpdateBrandingBody,
  UpdateProfileBody,
  UpdateSiteBody,
  UpdateSlugBody,
} from "./settings.dto";
import { resolveColors } from "./settings.defaults";

type Actor = {
  userId: string;
  orgRole?: OrgRole | string | null;
  globalRole?: string;
  schoolId: string;
};

function assertAdmin(actor: Actor) {
  const ok =
    actor.orgRole === OrgRole.SCHOOL_ADMIN ||
    actor.globalRole === "SUPER_ADMIN";
  if (!ok) {
    throw new ForbiddenError("Only school admin can change school settings");
  }
}

/** Public-safe payload for first paint on subdomain */
function toPublicBrand(org: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  motto: string | null;
  schoolType: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  isActive: boolean;
  site?: {
    heroTitle: string | null;
    heroSubtitle: string | null;
    aboutText: string | null;
    footerText: string | null;
    whatsapp: string | null;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    twitterUrl: string | null;
    showResultsCta: boolean;
    showAbout: boolean;
    showContact: boolean;
  } | null;
}) {
  const colors = resolveColors(org.primaryColor, org.accentColor);

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    ...colors,
    motto: org.motto,
    schoolType: org.schoolType,
    contact: {
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      state: org.state,
      country: org.country,
    },
    site: {
      heroTitle: org.site?.heroTitle ?? org.name,
      heroSubtitle:
        org.site?.heroSubtitle ??
        org.motto ??
        "Check term results securely with your PIN card",
      aboutText: org.site?.aboutText ?? null,
      footerText: org.site?.footerText ?? `© ${org.name}`,
      whatsapp: org.site?.whatsapp ?? null,
      websiteUrl: org.site?.websiteUrl ?? null,
      facebookUrl: org.site?.facebookUrl ?? null,
      instagramUrl: org.site?.instagramUrl ?? null,
      twitterUrl: org.site?.twitterUrl ?? null,
      showResultsCta: org.site?.showResultsCta ?? true,
      showAbout: org.site?.showAbout ?? true,
      showContact: org.site?.showContact ?? true,
    },
  };
}

function toAdminSettings(org: {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  motto: string | null;
  schoolType: string | null;
  isActive: boolean;
  onBoarded: boolean;
  createdAt: Date;
  updatedAt: Date;
  site?: Parameters<typeof toPublicBrand>[0]["site"];
}) {
  const colors = resolveColors(org.primaryColor, org.accentColor);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    email: org.email,
    phone: org.phone,
    logoUrl: org.logoUrl,
    primaryColor: colors.primaryColor,
    accentColor: colors.accentColor,
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
    site: toPublicBrand({
      ...org,
      isActive: org.isActive,
      site: org.site ?? null,
    }).site,
  };
}

const orgWithSite = {
  site: true,
} satisfies Prisma.OrganizationInclude;

export class SettingsService {
  /**
   * PUBLIC — load before auth on school subdomain.
   * Cache-friendly; no secrets.
   */
  async getPublicBrandBySlug(slug: string) {
    const org = await prisma.organization.findFirst({
      where: {
        slug: slug.toLowerCase(),
        isActive: true,
      },
      include: orgWithSite,
    });

    if (!org) throw new NotFoundError("School not found");

    return toPublicBrand(org);
  }

  /** Authenticated school context — full settings for admin UI */
  async getSettings(organizationId: string) {
    const org = await prisma.organization.findFirst({
      where: { id: organizationId },
      include: orgWithSite,
    });
    if (!org) throw new NotFoundError("School not found");
    return toAdminSettings(org);
  }

  async updateProfile(
    organizationId: string,
    body: UpdateProfileBody,
    actor: Actor
  ) {
    assertAdmin(actor);

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.state !== undefined ? { state: body.state } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.motto !== undefined ? { motto: body.motto } : {}),
        ...(body.schoolType !== undefined
          ? { schoolType: body.schoolType }
          : {}),
      },
      include: orgWithSite,
    });

    return toAdminSettings(org);
  }

  async updateBranding(
    organizationId: string,
    body: UpdateBrandingBody,
    actor: Actor
  ) {
    assertAdmin(actor);

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(body.primaryColor !== undefined
          ? { primaryColor: body.primaryColor }
          : {}),
        ...(body.accentColor !== undefined
          ? { accentColor: body.accentColor }
          : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
      },
      include: orgWithSite,
    });

    return toAdminSettings(org);
  }

  async updateSite(organizationId: string, body: UpdateSiteBody, actor: Actor) {
    assertAdmin(actor);

    // Ensure org exists
    const exists = await prisma.organization.findFirst({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("School not found");

    await prisma.organizationSite.upsert({
      where: { organizationId },
      create: {
        organizationId,
        heroTitle: body.heroTitle ?? null,
        heroSubtitle: body.heroSubtitle ?? null,
        aboutText: body.aboutText ?? null,
        footerText: body.footerText ?? null,
        whatsapp: body.whatsapp ?? null,
        websiteUrl: body.websiteUrl ?? null,
        facebookUrl: body.facebookUrl ?? null,
        instagramUrl: body.instagramUrl ?? null,
        twitterUrl: body.twitterUrl ?? null,
        showResultsCta: body.showResultsCta ?? true,
        showAbout: body.showAbout ?? true,
        showContact: body.showContact ?? true,
      },
      update: {
        ...(body.heroTitle !== undefined ? { heroTitle: body.heroTitle } : {}),
        ...(body.heroSubtitle !== undefined
          ? { heroSubtitle: body.heroSubtitle }
          : {}),
        ...(body.aboutText !== undefined ? { aboutText: body.aboutText } : {}),
        ...(body.footerText !== undefined
          ? { footerText: body.footerText }
          : {}),
        ...(body.whatsapp !== undefined ? { whatsapp: body.whatsapp } : {}),
        ...(body.websiteUrl !== undefined
          ? { websiteUrl: body.websiteUrl }
          : {}),
        ...(body.facebookUrl !== undefined
          ? { facebookUrl: body.facebookUrl }
          : {}),
        ...(body.instagramUrl !== undefined
          ? { instagramUrl: body.instagramUrl }
          : {}),
        ...(body.twitterUrl !== undefined
          ? { twitterUrl: body.twitterUrl }
          : {}),
        ...(body.showResultsCta !== undefined
          ? { showResultsCta: body.showResultsCta }
          : {}),
        ...(body.showAbout !== undefined ? { showAbout: body.showAbout } : {}),
        ...(body.showContact !== undefined
          ? { showContact: body.showContact }
          : {}),
      },
    });

    return this.getSettings(organizationId);
  }

  async updateSlug(organizationId: string, body: UpdateSlugBody, actor: Actor) {
    assertAdmin(actor);

    const slug = body.slug.toLowerCase();

    const reserved = new Set([
      "www",
      "app",
      "api",
      "admin",
      "portals",
      "mail",
      "status",
      "support",
      "help",
      "dashboard",
    ]);
    if (reserved.has(slug)) {
      throw new BadRequestError("This subdomain is reserved");
    }

    const clash = await prisma.organization.findFirst({
      where: { slug, NOT: { id: organizationId } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestError("This subdomain is already taken");
    }

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: { slug },
      include: orgWithSite,
    });

    return toAdminSettings(org);
  }

  /** Mark onboarding complete after branding saved */
  async completeOnboarding(organizationId: string, actor: Actor) {
    assertAdmin(actor);

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: { onBoarded: true },
      include: orgWithSite,
    });

    return toAdminSettings(org);
  }
}

export const settingsService = new SettingsService();
