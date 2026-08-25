"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
// import { AppError } from "../errors/AppError";
const response_1 = require("../http/response");
const env_1 = require("../../config/env");
const status_1 = require("../http/status");
const AppError_1 = require("../errors/AppError");
const errorHandler = (err, _req, res, _next) => {
    if (err instanceof AppError_1.AppError) {
        return (0, response_1.sendError)(res, err.statusCode, err.code, err.message, err.details);
    }
    if (err instanceof zod_1.ZodError) {
        return (0, response_1.sendError)(res, status_1.HttpStatus.UNPROCESSABLE, "VALIDATION_ERROR", "Validation failed", err.flatten());
    }
    // JWT errors (if jsonwebtoken throws)
    if (err && typeof err === "object" && "name" in err) {
        const name = err.name;
        if (name === "JsonWebTokenError") {
            return (0, response_1.sendError)(res, status_1.HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
        }
        if (name === "TokenExpiredError") {
            return (0, response_1.sendError)(res, status_1.HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "Token expired");
        }
    }
    console.error(err);
    const message = env_1.env.isProd
        ? "Internal server error"
        : err instanceof Error
            ? err.message
            : "Internal server error";
    return (0, response_1.sendError)(res, status_1.HttpStatus.INTERNAL, "INTERNAL_ERROR", message);
};
exports.errorHandler = errorHandler;
