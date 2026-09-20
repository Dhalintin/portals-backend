"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const AppError_1 = require("../errors/AppError");
const authenticate = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return next(new AppError_1.UnauthorizedError("Missing or invalid Authorization header"));
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
        return next(new AppError_1.UnauthorizedError("Missing token"));
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        if (!payload?.sub || !payload?.role) {
            return next(new AppError_1.UnauthorizedError("Invalid token payload"));
        }
        req.user = {
            sub: payload.sub,
            orgRole: payload.role,
            role: payload.role,
            schoolId: payload.schoolId ?? null,
            email: payload.email,
        };
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.authenticate = authenticate;
