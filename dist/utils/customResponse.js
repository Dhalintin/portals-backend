"use strict";
// src/utils/customResponse.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.customResponse = void 0;
const customResponse = ({ status, res, success, message, data, error, }) => {
    const responseBody = {
        success,
        message,
    };
    if (data !== undefined) {
        responseBody.data = data;
    }
    if (error !== undefined) {
        responseBody.error = error;
    }
    res.status(status).json(responseBody);
};
exports.customResponse = customResponse;
