"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const errors_1 = require("../lib/errors");
function signAccessToken(claims) {
    const payload = { ...claims, typ: "access" };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, {
        expiresIn: env_1.env.JWT_ACCESS_EXPIRES,
        issuer: env_1.env.APP_NAME,
        algorithm: "HS256",
    });
}
function signRefreshToken(claims, expiresAt) {
    const payload = {
        ...claims,
        typ: "refresh",
        ...(expiresAt ? { exp: Math.floor(expiresAt.getTime() / 1000) } : {}),
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_REFRESH_SECRET, {
        ...(expiresAt
            ? {}
            : { expiresIn: env_1.env.JWT_REFRESH_EXPIRES }),
        issuer: env_1.env.APP_NAME,
        algorithm: "HS256",
    });
}
function verifyAccessToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET, {
            issuer: env_1.env.APP_NAME,
            algorithms: ["HS256"],
        });
        if (decoded.typ !== "access" || !validSessionClaims(decoded)) {
            throw new Error("invalid");
        }
        return decoded;
    }
    catch {
        throw new errors_1.AppError(401, "UNAUTHORIZED", "Invalid or expired access token");
    }
}
function verifyRefreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET, {
            issuer: env_1.env.APP_NAME,
            algorithms: ["HS256"],
        });
        if (decoded.typ !== "refresh" ||
            !validSessionClaims(decoded) ||
            typeof decoded.jti !== "string" ||
            !decoded.jti) {
            throw new Error("invalid");
        }
        return decoded;
    }
    catch {
        throw new errors_1.AppError(401, "UNAUTHORIZED", "Invalid or expired refresh token");
    }
}
function validSessionClaims(claims) {
    return (typeof claims.sub === "string" &&
        claims.sub.length > 0 &&
        typeof claims.sid === "string" &&
        claims.sid.length > 0 &&
        (claims.schoolId === null ||
            (typeof claims.schoolId === "string" && claims.schoolId.length > 0)) &&
        typeof claims.authVersion === "number" &&
        Number.isSafeInteger(claims.authVersion) &&
        claims.authVersion >= 0 &&
        typeof claims.exp === "number" &&
        Number.isSafeInteger(claims.exp));
}
