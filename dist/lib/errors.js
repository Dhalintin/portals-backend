"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.isAppError = isAppError;
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "AppError";
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
function isAppError(err) {
    return err instanceof AppError;
}
