// src/common/http/response.ts
import type { Response } from "express";
import { HttpStatus } from "./status";

type SuccessBody<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

type ErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = HttpStatus.OK,
  meta?: Record<string, unknown>
) {
  const body: SuccessBody<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>
) {
  return sendSuccess(res, data, HttpStatus.CREATED, meta);
}

export function sendNoContent(res: Response) {
  return res.status(HttpStatus.NO_CONTENT).send();
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  const body: ErrorBody = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return res.status(statusCode).json(body);
}
