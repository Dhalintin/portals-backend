"use strict";
// import type { RequestHandler } from "express";
// import type { ZodSchema } from "zod";
// import { AppError } from "../lib/errors";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const errors_1 = require("../lib/errors");
function validate(schema, source = "body") {
    return (req, res, next) => {
        const parsed = schema.safeParse(req[source]);
        if (!parsed.success) {
            const fieldErrors = Object.fromEntries(Object.entries(parsed.error.flatten().fieldErrors).map(([field, messages]) => [field, messages?.join(". ")]));
            const firstError = Object.values(fieldErrors).find((message) => typeof message === "string" && message.length > 0) ?? "Invalid request";
            return next(new errors_1.AppError(400, "VALIDATION_ERROR", firstError, fieldErrors));
        }
        res.locals.validated = parsed.data;
        res.locals.validatedBySource ??= {};
        res.locals.validatedBySource[source] = parsed.data;
        // Express 5 exposes query through a getter; install the parsed value
        // as an own property so existing controllers consume defaults/transforms.
        Object.defineProperty(req, source, {
            value: parsed.data,
            writable: true,
            enumerable: true,
            configurable: true,
        });
        next();
    };
}
// import type { RequestHandler } from "express";
// import type { ZodSchema } from "zod";
// import { AppError } from "../lib/errors";
// type Source = "body" | "query" | "params";
// export function validate<T>(
//   schema: ZodSchema<T>,
//   source: Source = "body"
// ): RequestHandler {
//   return (req, _res, next) => {
//     const parsed = schema.safeParse(req[source]);
//     if (!parsed.success) {
//       return next(
//         new AppError(400, "VALIDATION_ERROR", "Invalid request", {
//           issues: parsed.error.flatten(),
//         })
//       );
//     }
//     req[source] = parsed.data as never;
//     next();
//   };
// }
