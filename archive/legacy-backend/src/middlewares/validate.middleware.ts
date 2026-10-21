import { Request, Response, NextFunction } from "express";
import { validationResult, ValidationError } from "express-validator";
import { customResponse } from "../utils/customResponse";

/**
 * Drop this at the end of any express-validator chain.
 * Collects all errors and returns a structured 422 response if any exist.
 *
 * Usage:
 *   [body("title").notEmpty(), ..., validate]
 */
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  const formatted = errors.array().map((err: ValidationError) => ({
    field: err.type === "field" ? err.path : undefined,
    message: err.msg,
  }));

  customResponse({
    status: 422,
    res,
    success: false,
    message: "Validation failed.",
    data: { errors: formatted },
  });
};
