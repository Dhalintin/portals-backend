// import { z } from "zod";
// import { NotificationType } from "@prisma/client";

// // export const createAnnouncementSchema = z.object({
// //   title: z.string().min(1).max(200),
// //   body: z.string().min(1).max(5000),
// //   isPinned: z.boolean().default(false),
// //   expiresAt: z.string().datetime().optional().nullable(),
// // });

// export const createAnnouncementSchema = z.object({
//   title: z.string().min(1).max(200),
//   body: z.string().min(1).max(5000),
//   isPinned: z.boolean().default(false),
//   expiresAt: z.string().datetime().optional().nullable(),

//   // null/undefined = save as draft
//   // past/now = publish immediately
//   // future = schedule
//   publishAt: z.string().datetime().optional().nullable(),
// });

// export const updateAnnouncementSchema = createAnnouncementSchema
//   .partial()
//   .extend({
//     isActive: z.boolean().optional(),
//   });

// export const listAnnouncementsQuerySchema = z.object({
//   activeOnly: z
//     .enum(["true", "false"])
//     .optional()
//     .transform((v) => v !== "false"),

//   limit: z.coerce.number().int().min(1).max(100).default(20),
// });

import { z } from "zod";

import { NotificationType } from "@prisma/client";

// export const createAnnouncementSchema = z.object({

//   title: z.string().min(1, "Must be at least 1 characters long.").max(200, "Must not exceed 200 characters."),

//   body: z.string().min(1, "Must be at least 1 characters long.").max(5000, "Must not exceed 5000 characters."),

//   isPinned: z.boolean().default(false),

//   expiresAt: z.string().datetime("Please provide a valid date and time.").optional().nullable(),

// });

export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(200, "Must not exceed 200 characters."),

  body: z
    .string()
    .min(1, "Must be at least 1 characters long.")
    .max(5000, "Must not exceed 5000 characters."),

  isPinned: z.boolean().default(false),

  expiresAt: z
    .string()
    .datetime("Please provide a valid date and time.")
    .optional()
    .nullable(),

  // null/undefined = save as draft

  // past/now = publish immediately

  // future = schedule

  publishAt: z
    .string()
    .datetime("Please provide a valid date and time.")
    .optional()
    .nullable(),
});

export const updateAnnouncementSchema = createAnnouncementSchema

  .partial()

  .extend({
    isActive: z.boolean().optional(),
  });

export const listAnnouncementsQuerySchema = z.object({
  activeOnly: z

    .enum(["true", "false"])

    .optional()

    .transform((v) => v !== "false"),

  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(100, "Must not exceed 100.")
    .default(20),
});

export const enqueueNotificationSchema = z.object({
  eventKey: z.string().trim().min(8).max(128),
  type: z.nativeEnum(NotificationType),
  recipient: z.string().min(5).max(100), // phone or email
  channel: z.enum(["whatsapp", "sms", "email", "inapp"]).default("whatsapp"),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(2000),
  payload: z.record(z.string(), z.any()).optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
}).strict().refine(data => data.channel !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.recipient),
  { path: ["recipient"], message: "Email delivery requires a valid email recipient" });
