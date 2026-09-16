// src/common/middleware/validate.ts
import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../errors/AppError";

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        // Attach validated data to a custom property
        (req as any).validatedQuery = schemas.query.parse(req.query);
      }
      // if (schemas.query) {
      //   req.query = schemas.query.parse(req.query) as typeof req.query;
      // }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
