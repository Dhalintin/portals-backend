import { z } from "zod";

const whyFeatureSchema = z.object({
  id: z
    .string()
    .min(1, "Feature ID is required")
    .max(40, "Feature ID cannot exceed 40 characters"),
  title: z
    .string()
    .trim()
    .min(1, "Feature title is required")
    .max(60, "Feature title cannot exceed 60 characters"),
  body: z
    .string()
    .trim()
    .min(1, "Feature description is required")
    .max(240, "Feature description cannot exceed 240 characters"),
});

export const updateSiteSchema = z.object({
  heroTitle: z
    .string()
    .trim()
    .max(200, "Hero title cannot exceed 200 characters")
    .nullable()
    .optional(),
  heroSubtitle: z
    .string()
    .trim()
    .max(400, "Hero subtitle cannot exceed 400 characters")
    .nullable()
    .optional(),
  aboutText: z
    .string()
    .trim()
    .max(10000, "About text cannot exceed 10,000 characters")
    .nullable()
    .optional(),
  footerText: z
    .string()
    .trim()
    .max(500, "Footer text cannot exceed 500 characters")
    .nullable()
    .optional(),
  whatsapp: z
    .string()
    .trim()
    .max(30, "WhatsApp number cannot exceed 30 characters")
    .nullable()
    .optional(),

  websiteUrl: z
    .string()
    .url("Please enter a valid website URL")
    .max(2048, "Website URL cannot exceed 2,048 characters")
    .nullable()
    .optional(),
  facebookUrl: z
    .string()
    .url("Please enter a valid Facebook URL")
    .max(2048, "Facebook URL cannot exceed 2,048 characters")
    .nullable()
    .optional(),
  instagramUrl: z
    .string()
    .url("Please enter a valid Instagram URL")
    .max(2048, "Instagram URL cannot exceed 2,048 characters")
    .nullable()
    .optional(),
  twitterUrl: z
    .string()
    .url("Please enter a valid X (Twitter) URL")
    .max(2048, "X (Twitter) URL cannot exceed 2,048 characters")
    .nullable()
    .optional(),

  showResultsCta: z.boolean().optional(),
  showAbout: z.boolean().optional(),
  showContact: z.boolean().optional(),

  whyEyebrow: z
    .string()
    .trim()
    .max(80, "Section eyebrow text cannot exceed 80 characters")
    .nullable()
    .optional(),
  whyTitle: z
    .string()
    .trim()
    .max(120, "Section title cannot exceed 120 characters")
    .nullable()
    .optional(),
  whyFeatures: z
    .array(whyFeatureSchema)
    .max(6, "You can add a maximum of 6 feature items")
    .nullable()
    .optional(),
});

export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

// import { z } from "zod";

// const whyFeatureSchema = z.object({
//   id: z.string().min(1).max(40),
//   title: z.string().trim().min(1).max(60),
//   body: z.string().trim().min(1).max(240),
// });

// export const updateSiteSchema = z.object({
//   heroTitle: z.string().trim().max(200).nullable().optional(),
//   heroSubtitle: z.string().trim().max(400).nullable().optional(),
//   aboutText: z.string().trim().max(10000).nullable().optional(),
//   footerText: z.string().trim().max(500).nullable().optional(),
//   whatsapp: z.string().trim().max(30).nullable().optional(),
//   websiteUrl: z.string().url().max(2048).nullable().optional(),
//   facebookUrl: z.string().url().max(2048).nullable().optional(),
//   instagramUrl: z.string().url().max(2048).nullable().optional(),
//   twitterUrl: z.string().url().max(2048).nullable().optional(),
//   showResultsCta: z.boolean().optional(),
//   showAbout: z.boolean().optional(),
//   showContact: z.boolean().optional(),
//   whyEyebrow: z.string().trim().max(80).nullable().optional(),
//   whyTitle: z.string().trim().max(120).nullable().optional(),
//   whyFeatures: z.array(whyFeatureSchema).max(6).nullable().optional(),
// });

// export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
