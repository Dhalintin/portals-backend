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
import { AppError } from "../errors/AppError";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
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
