"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
// src/lib/jwt.ts
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtSecret = process.env.JWT_SECRET || "";
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: "14d" });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, jwtSecret);
}
