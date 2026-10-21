import bcrypt from "bcryptjs";
import { env } from "../config/env";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
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
