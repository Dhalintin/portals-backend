"use strict";
// import { z } from "zod";
// import { NotificationType } from "@prisma/client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueNotificationSchema = exports.listAnnouncementsQuerySchema = exports.updateAnnouncementSchema = exports.createAnnouncementSchema = void 0;
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
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
// export const createAnnouncementSchema = z.object({
//   title: z.string().min(1, "Must be at least 1 characters long.").max(200, "Must not exceed 200 characters."),
//   body: z.string().min(1, "Must be at least 1 characters long.").max(5000, "Must not exceed 5000 characters."),
//   isPinned: z.boolean().default(false),
//   expiresAt: z.string().datetime("Please provide a valid date and time.").optional().nullable(),
// });
exports.createAnnouncementSchema = zod_1.z.object({
    title: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(200, "Must not exceed 200 characters."),
    body: zod_1.z
        .string()
        .min(1, "Must be at least 1 characters long.")
        .max(5000, "Must not exceed 5000 characters."),
    isPinned: zod_1.z.boolean().default(false),
    expiresAt: zod_1.z
        .string()
        .datetime("Please provide a valid date and time.")
        .optional()
        .nullable(),
    // null/undefined = save as draft
    // past/now = publish immediately
    // future = schedule
    publishAt: zod_1.z
        .string()
        .datetime("Please provide a valid date and time.")
        .optional()
        .nullable(),
});
exports.updateAnnouncementSchema = exports.createAnnouncementSchema
    .partial()
    .extend({
    isActive: zod_1.z.boolean().optional(),
});
exports.listAnnouncementsQuerySchema = zod_1.z.object({
    activeOnly: zod_1.z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v !== "false"),
    limit: zod_1.z.coerce
        .number()
        .int("Please enter a whole number.")
        .min(1, "Must be at least 1.")
        .max(100, "Must not exceed 100.")
        .default(20),
});
exports.enqueueNotificationSchema = zod_1.z.object({
    eventKey: zod_1.z.string().trim().min(8).max(128),
    type: zod_1.z.nativeEnum(client_1.NotificationType),
    recipient: zod_1.z.string().min(5).max(100), // phone or email
    channel: zod_1.z.enum(["whatsapp", "sms", "email", "inapp"]).default("whatsapp"),
    title: zod_1.z.string().max(200).optional(),
    body: zod_1.z.string().min(1).max(2000),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    entityType: zod_1.z.string().optional(),
    entityId: zod_1.z.string().uuid().optional(),
    scheduledAt: zod_1.z.string().datetime().optional(),
}).strict().refine(data => data.channel !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.recipient), { path: ["recipient"], message: "Email delivery requires a valid email recipient" });
