"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.inPrismaTransaction = inPrismaTransaction;
const node_async_hooks_1 = require("node:async_hooks");
// import { PrismaClient } from "@prisma/client";
// const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// export const prisma =
//   globalForPrisma.prisma ??
//   new PrismaClient({
//     log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
//   });
// if (process.env.NODE_ENV !== "production") {
//   globalForPrisma.prisma = client;
// }
// // src/lib/prisma.ts
const client_1 = require("@prisma/client");
// If generate output is custom, import from that path instead, e.g.:
// import { PrismaClient } from "../generated/prisma/client";
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = __importDefault(require("pg"));
const env_1 = require("../config/env");
const globalForPrisma = globalThis;
function createPrismaClient() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }
    const pool = new pg_1.default.Pool({ connectionString, connectionTimeoutMillis: 5000, max: env_1.env.DB_POOL_MAX });
    const adapter = new adapter_pg_1.PrismaPg(pool, { disposeExternalPool: true });
    return new client_1.PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
}
const client = globalForPrisma.prisma ?? createPrismaClient();
const transactions = new node_async_hooks_1.AsyncLocalStorage();
function inPrismaTransaction(tx, work) { return transactions.run(tx, work); }
exports.prisma = new Proxy(client, { get(target, key) { const tx = transactions.getStore(); if (tx && key === '$transaction')
        return (work) => typeof work === 'function' ? work(tx) : Promise.all(work); const source = tx ?? target, value = Reflect.get(source, key); return typeof value === 'function' ? value.bind(source) : value; } });
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
}
