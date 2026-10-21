import type { RequestHandler } from "express";
import { randomUUID } from "crypto";

export const requestId: RequestHandler = (req, res, next) => {
  const id =
    (typeof req.headers["x-request-id"] === "string" &&
      req.headers["x-request-id"]) ||
    randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
