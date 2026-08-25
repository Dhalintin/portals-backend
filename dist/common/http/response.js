"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendCreated = sendCreated;
exports.sendNoContent = sendNoContent;
exports.sendError = sendError;
const status_1 = require("./status");
function sendSuccess(res, data, statusCode = status_1.HttpStatus.OK, meta) {
    const body = { success: true, data };
    if (meta)
        body.meta = meta;
    return res.status(statusCode).json(body);
}
function sendCreated(res, data, meta) {
    return sendSuccess(res, data, status_1.HttpStatus.CREATED, meta);
}
function sendNoContent(res) {
    return res.status(status_1.HttpStatus.NO_CONTENT).send();
}
function sendError(res, statusCode, code, message, details) {
    const body = {
        success: false,
        error: { code, message },
    };
    if (details !== undefined)
        body.error.details = details;
    return res.status(statusCode).json(body);
}
