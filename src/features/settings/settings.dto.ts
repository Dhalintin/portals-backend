import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(
    /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/,
    "Use a valid hex colour e.g. #0A1628"
  );

export const slugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid school slug"),
});

export const updateProfileBodySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().max(80).optional(),
  motto: z.string().trim().max(200).optional().nullable(),
  schoolType: z.string().trim().max(80).optional().nullable(),
});

export const updateBrandingBodySchema = z.object({
  primaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  /** Allow clearing logo */
  // logoUrl null = remove
});

export const updateSiteBodySchema = z.object({
  heroTitle: z.string().trim().max(120).optional().nullable(),
  heroSubtitle: z.string().trim().max(300).optional().nullable(),
  aboutText: z.string().trim().max(5000).optional().nullable(),
  footerText: z.string().trim().max(500).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  websiteUrl: z.string().url().max(300).optional().nullable(),
  facebookUrl: z.string().url().max(300).optional().nullable(),
  instagramUrl: z.string().url().max(300).optional().nullable(),
  twitterUrl: z.string().url().max(300).optional().nullable(),
  showResultsCta: z.boolean().optional(),
  showAbout: z.boolean().optional(),
  showContact: z.boolean().optional(),
});

/** Optional: request slug change — validate uniqueness in service */
export const updateSlugBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, hyphens"
    ),
});

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
export type UpdateBrandingBody = z.infer<typeof updateBrandingBodySchema>;
export type UpdateSiteBody = z.infer<typeof updateSiteBodySchema>;
export type UpdateSlugBody = z.infer<typeof updateSlugBodySchema>;
