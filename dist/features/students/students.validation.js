"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollStudentSchema = exports.studentIdParamsSchema = exports.updateStudentSchema = exports.bulkCreateStudentsSchema = exports.createStudentSchema = exports.listStudentsQuerySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.listStudentsQuerySchema = zod_1.z.object({
    q: zod_1.z
        .string()
        .trim()
        .max(120, "Search query cannot exceed 120 characters")
        .optional(),
    classId: zod_1.z.string().uuid("Please provide a valid class ID").optional(),
    isActive: zod_1.z
        .enum(["true", "false"], { message: "Active filter must be true or false" })
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    page: zod_1.z.coerce
        .number({ error: "Page must be a number" })
        .int("Page must be a whole number")
        .min(1, "Page must be at least 1")
        .default(1),
    limit: zod_1.z.coerce
        .number({ error: "Page size must be a number" })
        .int("Page size must be a whole number")
        .min(1, "Page size must be at least 1")
        .max(100, "Page size cannot exceed 100")
        .default(20),
});
exports.createStudentSchema = zod_1.z.object({
    admissionNumber: zod_1.z
        .string()
        .trim()
        .max(40, "Admission number cannot exceed 40 characters")
        .optional(),
    firstName: zod_1.z
        .string({
        error: "First name must be text",
    })
        .trim()
        .min(1, "First name is required")
        .max(80, "First name cannot exceed 80 characters"),
    lastName: zod_1.z
        .string({
        error: "Last name must be text",
    })
        .trim()
        .min(1, "Last name is required")
        .max(80, "Last name cannot exceed 80 characters"),
    otherNames: zod_1.z
        .string()
        .trim()
        .max(80, "Other names cannot exceed 80 characters")
        .nullable()
        .optional(),
    gender: zod_1.z
        .nativeEnum(client_1.GenderType, { message: "Please select a valid gender" })
        .nullable()
        .optional(),
    dateOfBirth: zod_1.z.coerce
        .date({
        error: "Please provide a valid date of birth",
    })
        .nullable()
        .optional(),
    classId: zod_1.z
        .string()
        .uuid("Please provide a valid class ID")
        .nullable()
        .optional(),
    parentPhone: zod_1.z
        .string()
        .trim()
        .max(30, "Parent's phone number cannot exceed 30 characters")
        .nullable()
        .optional(),
    parentEmail: zod_1.z
        .string()
        .trim()
        .email("Please provide a valid parent email address")
        .max(320, "Parent email cannot exceed 320 characters")
        .transform((v) => v.toLowerCase())
        .nullable()
        .optional(),
    /** When set, also create StudentEnrollment for this session */
    sessionId: zod_1.z
        .string()
        .uuid("Please provide a valid academic session ID")
        .optional(),
});
exports.bulkCreateStudentsSchema = zod_1.z.object({
    students: zod_1.z
        .array(exports.createStudentSchema)
        .min(1, "At least one student is required")
        .max(500, "You can create a maximum of 500 students at once"),
});
exports.updateStudentSchema = exports.createStudentSchema
    .omit({ sessionId: true })
    .partial();
exports.studentIdParamsSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid("Please provide a valid student ID"),
});
exports.enrollStudentSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid("Please provide a valid class ID"),
    sessionId: zod_1.z.string().uuid("Please provide a valid academic session ID"),
});
// import { z } from "zod";
// import { GenderType } from "@prisma/client";
// export const listStudentsQuerySchema = z.object({
//   q: z.string().trim().max(120).optional(),
//   classId: z.string().uuid().optional(),
//   isActive: z
//     .enum(["true", "false"])
//     .optional()
//     .transform((v) => (v === undefined ? undefined : v === "true")),
//   page: z.coerce.number().int().min(1).default(1),
//   limit: z.coerce.number().int().min(1).max(100).default(20),
// });
// export const createStudentSchema = z.object({
//   admissionNumber: z
//     .string()
//     .trim()
//     .max(40, "Admission number cannot exceed 40 characters")
//     .optional(),
//   firstName: z
//     .string()
//     .trim()
//     .min(1, "First name cannot be less than 1 character")
//     .max(80, "First name cannot exceed 80 characters"),
//   lastName: z
//     .string()
//     .trim()
//     .min(1, "First name cannot be less than 1 character")
//     .max(80, "Admission number cannot exceed 80 characters"),
//   otherNames: z.string().trim().max(80).nullable().optional(),
//   gender: z.nativeEnum(GenderType).nullable().optional(),
//   dateOfBirth: z.coerce.date().nullable().optional(),
//   classId: z.string().uuid().nullable().optional(),
//   parentPhone: z.string().trim().max(30).nullable().optional(),
//   parentEmail: z
//     .string()
//     .email()
//     .max(320)
//     .transform((v) => v.trim().toLowerCase())
//     .nullable()
//     .optional(),
//   /** When set, also create StudentEnrollment for this session */
//   sessionId: z.string().uuid().optional(),
// });
// export const updateStudentSchema = createStudentSchema
//   .omit({ sessionId: true })
//   .partial();
// export const studentIdParamsSchema = z.object({
//   studentId: z.string().uuid(),
// });
// export const enrollStudentSchema = z.object({
//   classId: z.string().uuid(),
//   sessionId: z.string().uuid(),
// });
