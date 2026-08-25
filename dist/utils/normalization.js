"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeArm = normalizeArm;
/** Normalize arm for unique constraint (null vs undefined) */
function normalizeArm(arm) {
    if (arm === undefined || arm === null || arm === "")
        return null;
    return arm;
}
