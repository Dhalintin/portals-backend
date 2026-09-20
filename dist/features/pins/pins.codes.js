"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePinCode = generatePinCode;
exports.normalizePinCode = normalizePinCode;
exports.formatPinCodeDisplay = formatPinCodeDisplay;
exports.maskPinCode = maskPinCode;
const crypto_1 = require("crypto");
/**
 * Unambiguous alphabet (no 0/O, 1/I/L).
 * 12 chars from 32 symbols ≈ 60 bits entropy.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePinCode(length = 12) {
    const bytes = (0, crypto_1.randomBytes)(length);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    // Group for print: XXXX-XXXX-XXXX
    return out.match(/.{1,4}/g)?.join("-") ?? out;
}
/** Strip separators for compare / storage consistency */
function normalizePinCode(raw) {
    return raw.replace(/[\s-]/g, "").toUpperCase();
}
/** Store without dashes; display with dashes */
function formatPinCodeDisplay(stored) {
    const n = normalizePinCode(stored);
    return n.match(/.{1,4}/g)?.join("-") ?? n;
}
function maskPinCode(stored) {
    const n = normalizePinCode(stored);
    if (n.length <= 4)
        return "****";
    return `${"*".repeat(Math.max(n.length - 4, 4))}${n.slice(-4)}`;
}
