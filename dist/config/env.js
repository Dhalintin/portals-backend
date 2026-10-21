"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const trustProxy_1 = require("./trustProxy");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    APP_NAME: zod_1.z.string().default("SchoolOS"),
    DATABASE_URL: zod_1.z.string().min(1),
    DB_POOL_MAX: zod_1.z.coerce.number().int().min(1).max(20).default(5),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_ACCESS_EXPIRES: zod_1.z.string().default("15m"),
    JWT_REFRESH_EXPIRES: zod_1.z.string().default("7d"),
    BCRYPT_ROUNDS: zod_1.z.coerce.number().int().min(10).max(14).default(12),
    /** Public web origin for reset links */
    WEB_URL: zod_1.z.string().url().optional(),
    CORS_ORIGINS: zod_1.z.string().default("http://localhost:3000"),
    TRUST_PROXY: zod_1.z.string().default("false").transform(trustProxy_1.parseTrustProxy),
    EMAIL_PROVIDER: zod_1.z.enum(["disabled", "smtp", "resend"]).default("disabled"),
    EMAIL_FROM: zod_1.z.string().email().optional(),
    AUTH_EMAIL_KEY: zod_1.z.string().optional(),
    RESEND_API_KEY: zod_1.z.string().optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().int().positive().default(587),
    SMTP_SECURE: zod_1.z.enum(["true", "false"]).default("false").transform(value => value === "true"),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASSWORD: zod_1.z.string().optional(),
});
function loadEnv() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        const msg = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new Error(`Invalid environment: ${msg}`);
    }
    return { ...parsed.data, isProd: parsed.data.NODE_ENV === "production" };
}
exports.env = loadEnv();
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
