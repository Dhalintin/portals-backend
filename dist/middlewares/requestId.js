"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = void 0;
const crypto_1 = require("crypto");
const requestId = (req, res, next) => {
    const id = (typeof req.headers["x-request-id"] === "string" &&
        req.headers["x-request-id"]) ||
        (0, crypto_1.randomUUID)();
    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
};
exports.requestId = requestId;
