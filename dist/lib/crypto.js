"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomToken = randomToken;
exports.sha256 = sha256;
// src/lib/crypto.ts
const crypto_1 = require("crypto");
function randomToken(bytes = 32) {
    return (0, crypto_1.randomBytes)(bytes).toString("hex");
}
function sha256(value) {
    return (0, crypto_1.createHash)("sha256").update(value).digest("hex");
}
