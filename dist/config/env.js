"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
// src/config/env.ts
function required(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing env: ${name}`);
    return v;
}
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 4000),
    jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    isProd: (process.env.NODE_ENV ?? "development") === "production",
};
