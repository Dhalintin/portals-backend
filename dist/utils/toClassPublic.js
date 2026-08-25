"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toClassPublic = toClassPublic;
const displayName_1 = require("./displayName");
function toClassPublic(row) {
    return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        arm: row.arm,
        level: row.level,
        isActive: row.isActive,
        displayName: (0, displayName_1.displayClassName)(row.name, row.arm),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
