"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readiness = void 0;
const prisma_1 = require("./prisma");
exports.readiness = {
    checkDatabase: () => prisma_1.prisma.$queryRaw `SELECT 1`,
};
