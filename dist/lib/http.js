"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
function sendSuccess(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}
function sendError(res, status, code, message, requestId, details) {
    return res.status(status).json({
        success: false,
        error: { code, message, details },
        requestId,
    });
}
