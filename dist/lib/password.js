"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_1 = require("../config/env");
async function hashPassword(plain) {
    return bcryptjs_1.default.hash(plain, env_1.env.BCRYPT_ROUNDS);
}
async function verifyPassword(plain, hash) {
    if (!hash)
        return false;
    return bcryptjs_1.default.compare(plain, hash);
}
// // src/lib/password.ts
// import bcrypt from "bcryptjs";
// const ROUNDS = 12;
// export async function hashPassword(plain: string): Promise<string> {
//   return bcrypt.hash(plain, ROUNDS);
// }
// export async function verifyPassword(
//   plain: string,
//   hash: string
// ): Promise<boolean> {
//   return bcrypt.compare(plain, hash);
// }
