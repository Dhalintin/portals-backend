// src/common/middleware/errorHandler.ts
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { ZodError } from "zod";
// import { AppError } from "../errors/AppError";
import { sendError } from "../http/response";
import { env } from "../../config/env";
import { HttpStatus } from "../http/status";
import { AppError } from "../../lib/errors";
import { AppError as LegacyAppError } from "../errors/AppError";
// import { AppError } from "../errors/AppError";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Express body parsers attach these types before route validation runs.
  if (err && typeof err === "object" && "type" in err) {
    if (err.type === "entity.parse.failed") {
      return sendError(res, 400, "INVALID_JSON", "Request body must contain valid JSON");
    }
    if (err.type === "entity.too.large") {
      return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the allowed size");
    }
  }

  if (err instanceof AppError || err instanceof LegacyAppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    return sendError(
      res,
      HttpStatus.UNPROCESSABLE,
      "VALIDATION_ERROR",
      "Validation failed",
      err.flatten()
    );
  }

  // JWT errors (if jsonwebtoken throws)
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;
    if (name === "JsonWebTokenError") {
      return sendError(
        res,
        HttpStatus.UNAUTHORIZED,
        "INVALID_TOKEN",
        "Invalid token"
      );
    }
    if (name === "TokenExpiredError") {
      return sendError(
        res,
        HttpStatus.UNAUTHORIZED,
        "TOKEN_EXPIRED",
        "Token expired"
      );
    }
  }

  console.error(err);

  const message = env.isProd
    ? "Internal server error"
    : err instanceof Error
    ? err.message
    : "Internal server error";

  return sendError(res, HttpStatus.INTERNAL, "INTERNAL_ERROR", message);
};
