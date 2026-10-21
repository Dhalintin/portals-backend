import { randomBytes } from "crypto";

/**
 * Unambiguous alphabet (no 0/O, 1/I/L).
 * 12 chars from 32 symbols ≈ 60 bits entropy.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePinCode(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  // Group for print: XXXX-XXXX-XXXX
  return out.match(/.{1,4}/g)?.join("-") ?? out;
}

/** Strip separators for compare / storage consistency */
export function normalizePinCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Store without dashes; display with dashes */
export function formatPinCodeDisplay(stored: string): string {
  const n = normalizePinCode(stored);
  return n.match(/.{1,4}/g)?.join("-") ?? n;
}

export function maskPinCode(stored: string): string {
  const n = normalizePinCode(stored);
  if (n.length <= 4) return "****";
  return `${"*".repeat(Math.max(n.length - 4, 4))}${n.slice(-4)}`;
}
