import { z } from "zod";
import { parseTrustProxy } from "./trustProxy";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default("SchoolOS"),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  /** Public web origin for reset links */
  WEB_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  TRUST_PROXY: z.string().default("false").transform(parseTrustProxy),
  EMAIL_PROVIDER: z.enum(["disabled", "smtp", "resend"]).default("disabled"),
  EMAIL_FROM: z.string().email().optional(),
  AUTH_EMAIL_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & { isProd: boolean };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  return { ...parsed.data, isProd: parsed.data.NODE_ENV === "production" };
}

export const env = loadEnv();
// // src/config/env.ts

// function required(name: string): string {
//   const v = process.env[name];
//   if (!v) throw new Error(`Missing env: ${name}`);
//   return v;
// }

// export const env = {
//   nodeEnv: process.env.NODE_ENV ?? "development",
//   port: Number(process.env.PORT ?? 4000),
//   jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
//   jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
//   isProd: (process.env.NODE_ENV ?? "development") === "production",
// };
