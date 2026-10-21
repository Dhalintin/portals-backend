"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAdmissionNumber = generateAdmissionNumber;
exports.isAdmissionNumberConflict = isAdmissionNumberConflict;
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
function generateAdmissionNumber() {
    const year = new Date().getFullYear();
    const suffix = (0, node_crypto_1.randomBytes)(4).toString("hex").toUpperCase();
    return `ADM-${year}-${suffix}`;
}
function isAdmissionNumberConflict(error) {
    if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002") {
        return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
        ? target.some((field) => String(field).toLowerCase().includes("admissionnumber"))
        : String(target ?? "")
            .toLowerCase()
            .includes("admissionnumber");
}
