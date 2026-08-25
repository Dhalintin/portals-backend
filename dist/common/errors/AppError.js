"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
// src/common/errors/AppError.ts
class AppError extends Error {
    statusCode;
    code;
    details;
    isOperational;
    constructor(statusCode, message, options) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = options?.code ?? "APP_ERROR";
        this.details = options?.details;
        this.isOperational = options?.isOperational ?? true;
        Error.captureStackTrace?.(this, this.constructor);
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    constructor(message = "Bad request", details) {
        super(400, message, { code: "BAD_REQUEST", details });
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(401, message, { code: "UNAUTHORIZED" });
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(403, message, { code: "FORBIDDEN" });
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(message = "Not found") {
        super(404, message, { code: "NOT_FOUND" });
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = "Conflict", details) {
        super(409, message, { code: "CONFLICT", details });
    }
}
exports.ConflictError = ConflictError;
class ValidationError extends AppError {
    constructor(message = "Validation failed", details) {
        super(422, message, { code: "VALIDATION_ERROR", details });
    }
}
exports.ValidationError = ValidationError;
