import { z } from "zod";
import { TermName } from "@prisma/client";

export const createSessionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Must be at least 2 characters long.")
    .max(40, "Must not exceed 40 characters."),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  isCurrent: z.boolean().optional(),
});

export const updateSessionSchema = createSessionSchema.partial();

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid("Please provide a valid ID."),
});

const calendarDate=z.union([z.date(),z.string().refine(value=>{
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return false;
  const day=value.slice(0,10),date=new Date(day+'T00:00:00.000Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day&&Number.isFinite(new Date(value).getTime());
},'Enter a real calendar date.').transform(value=>new Date(value.slice(0,10)+'T00:00:00.000Z'))]);

export const createTermSchema = z.object({
  name: z.nativeEnum(TermName, { error: "Please select a valid term." }),
  startDate: calendarDate.optional().nullable(),
  endDate: calendarDate.optional().nullable(),
  isCurrent: z.boolean().optional(),
});

export const updateTermSchema = z.object({
  startDate: calendarDate.optional().nullable(),
  endDate: calendarDate.optional().nullable(),
  isCurrent: z.boolean().optional(),
});

export const termIdParamsSchema = z.object({
  sessionId: z.string().uuid("Please provide a valid ID."),
  termId: z.string().uuid("Please provide a valid ID."),
});

// import { z } from "zod";
// import { TermName } from "@prisma/client";

// export const createSessionSchema = z.object({
//   name: z.string().trim().min(2).max(40), // e.g. 2025/2026
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });

// export const updateSessionSchema = createSessionSchema.partial();

// export const sessionIdParamsSchema = z.object({
//   sessionId: z.string().uuid(),
// });

// export const createTermSchema = z.object({
//   name: z.nativeEnum(TermName),
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });

// export const updateTermSchema = z.object({
//   startDate: z.coerce.date().optional().nullable(),
//   endDate: z.coerce.date().optional().nullable(),
//   isCurrent: z.boolean().optional(),
// });

// export const termIdParamsSchema = z.object({
//   sessionId: z.string().uuid(),
//   termId: z.string().uuid(),
// });
