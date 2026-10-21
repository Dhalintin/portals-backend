import { z } from "zod";

import { AttendanceStatus } from "@prisma/client";

const statusEnum = z.nativeEnum(AttendanceStatus, {
  error: "Please select a valid attendance status.",
});

export const markClassAttendanceSchema = z.object({
  classId: z.string().uuid("Please provide a valid ID."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  // Mark everyone present, then override exceptions
  defaultStatus: statusEnum.default("PRESENT"),
  exceptions: z
    .array(
      z.object({
        studentId: z.string().uuid("Please provide a valid ID."),
        status: statusEnum,
        note: z.string().max(500, "Must not exceed 500 characters.").optional(),
        clientKey: z
          .string()
          .max(64, "Must not exceed 64 characters.")
          .optional(), // offline support
      })
    )
    .default([]),
});

export const updateAttendanceSchema = z.object({
  status: statusEnum,
  note: z
    .string()
    .max(500, "Must not exceed 500 characters.")
    .optional()
    .nullable(),
});

export const listByClassDateSchema = z.object({
  classId: z.string().uuid("Please provide a valid ID."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
});

export const listByStudentSchema = z.object({
  studentId: z.string().uuid("Please provide a valid ID."),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional(),
  limit: z.coerce
    .number()
    .int("Please enter a whole number.")
    .min(1, "Must be at least 1.")
    .max(200, "Must not exceed 200.")
    .default(50),
});

export const offlineSyncSchema = z.object({
  records: z
    .array(
      z.object({
        clientKey: z
          .string()
          .min(8, "Must be at least 8 characters long.")
          .max(64, "Must not exceed 64 characters."),
        studentId: z.string().uuid("Please provide a valid ID."),
        classId: z.string().uuid("Please provide a valid ID."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
        status: statusEnum,
        note: z.string().max(500, "Must not exceed 500 characters.").optional(),
      })
    )
    .min(1, "Must be at least 1 characters long.")
    .max(200, "Must not exceed 200 characters."),
});

export type MarkClassAttendanceInput = z.infer<
  typeof markClassAttendanceSchema
>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type OfflineSyncInput = z.infer<typeof offlineSyncSchema>;

// import { z } from "zod";
// import { AttendanceStatus } from "@prisma/client";

// const statusEnum = z.nativeEnum(AttendanceStatus);

// export const markClassAttendanceSchema = z.object({
//   classId: z.string().uuid(),
//   date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
//   // Mark everyone present, then override exceptions
//   defaultStatus: statusEnum.default("PRESENT"),
//   exceptions: z
//     .array(
//       z.object({
//         studentId: z.string().uuid(),
//         status: statusEnum,
//         note: z.string().max(500).optional(),
//         clientKey: z.string().max(64).optional(), // offline support
//       })
//     )
//     .default([]),
// });

// export const updateAttendanceSchema = z.object({
//   status: statusEnum,
//   note: z.string().max(500).optional().nullable(),
// });

// export const listByClassDateSchema = z.object({
//   classId: z.string().uuid(),
//   date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
// });

// export const listByStudentSchema = z.object({
//   studentId: z.string().uuid(),
//   from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
//   to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
//   limit: z.coerce.number().int().min(1).max(200).default(50),
// });

// export const offlineSyncSchema = z.object({
//   records: z
//     .array(
//       z.object({
//         clientKey: z.string().min(8).max(64),
//         studentId: z.string().uuid(),
//         classId: z.string().uuid(),
//         date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
//         status: statusEnum,
//         note: z.string().max(500).optional(),
//       })
//     )
//     .min(1)
//     .max(200),
// });

// export type MarkClassAttendanceInput = z.infer<typeof markClassAttendanceSchema>;
// export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
// export type OfflineSyncInput = z.infer<typeof offlineSyncSchema>;
