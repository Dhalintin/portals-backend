"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const jwtSecret = process.env.JWT_SECRET || "";
if (!jwtSecret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}
class TokenService {
    generateToken(userId, role) {
        return jsonwebtoken_1.default.sign({ userId, role }, jwtSecret, { expiresIn: "14d" });
    }
    generateResetToken(userId, role) {
        return jsonwebtoken_1.default.sign({ userId, role }, jwtSecret, { expiresIn: "15m" });
    }
    generateRefreshToken(userId, role) {
        return jsonwebtoken_1.default.sign({ userId, role }, jwtSecret, { expiresIn: "14d" });
    }
    verifyToken(token) {
        return jsonwebtoken_1.default.verify(token, jwtSecret);
    }
}
exports.tokenService = new TokenService();
