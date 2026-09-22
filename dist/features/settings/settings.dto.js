"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSlugBodySchema = exports.updateSiteBodySchema = exports.updateBrandingBodySchema = exports.updateProfileBodySchema = exports.slugParamSchema = void 0;
const zod_1 = require("zod");
const hexColor = zod_1.z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Use a valid hex colour e.g. #0A1628");
exports.slugParamSchema = zod_1.z.object({
    slug: zod_1.z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid school slug"),
});
exports.updateProfileBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(120).optional(),
    email: zod_1.z.string().trim().email().optional().nullable(),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    address: zod_1.z.string().trim().max(300).optional().nullable(),
    city: zod_1.z.string().trim().max(80).optional().nullable(),
    state: zod_1.z.string().trim().max(80).optional().nullable(),
    country: zod_1.z.string().trim().max(80).optional(),
    motto: zod_1.z.string().trim().max(200).optional().nullable(),
    schoolType: zod_1.z.string().trim().max(80).optional().nullable(),
});
exports.updateBrandingBodySchema = zod_1.z.object({
    primaryColor: hexColor.optional(),
    accentColor: hexColor.optional(),
    logoUrl: zod_1.z.string().url().max(500).optional().nullable(),
    /** Allow clearing logo */
    // logoUrl null = remove
});
exports.updateSiteBodySchema = zod_1.z.object({
    heroTitle: zod_1.z.string().trim().max(120).optional().nullable(),
    heroSubtitle: zod_1.z.string().trim().max(300).optional().nullable(),
    aboutText: zod_1.z.string().trim().max(5000).optional().nullable(),
    footerText: zod_1.z.string().trim().max(500).optional().nullable(),
    whatsapp: zod_1.z.string().trim().max(30).optional().nullable(),
    websiteUrl: zod_1.z.string().url().max(300).optional().nullable(),
    facebookUrl: zod_1.z.string().url().max(300).optional().nullable(),
    instagramUrl: zod_1.z.string().url().max(300).optional().nullable(),
    twitterUrl: zod_1.z.string().url().max(300).optional().nullable(),
    showResultsCta: zod_1.z.boolean().optional(),
    showAbout: zod_1.z.boolean().optional(),
    showContact: zod_1.z.boolean().optional(),
});
/** Optional: request slug change — validate uniqueness in service */
exports.updateSlugBodySchema = zod_1.z.object({
    slug: zod_1.z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, hyphens"),
});
