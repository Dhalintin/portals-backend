"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authEmailTransport = void 0;
exports.encryptAuthEmail = encryptAuthEmail;
exports.decryptAuthEmail = decryptAuthEmail;
exports.authLink = authLink;
exports.enqueueAuthEmail = enqueueAuthEmail;
exports.assertAuthEmailDeliveryConfigured = assertAuthEmailDeliveryConfigured;
exports.assertEmailDeliveryConfigured = assertEmailDeliveryConfigured;
exports.processAuthEmail = processAuthEmail;
const crypto_1 = require("crypto");
const nodemailer_1 = __importDefault(require("nodemailer"));
const mailing_1 = require("../utils/mailing");
const env_1 = require("../config/env");
const prisma_1 = require("./prisma");
const errors_1 = require("./errors");
function key() {
    const value = Buffer.from(env_1.env.AUTH_EMAIL_KEY ?? "", "base64");
    if (value.length !== 32)
        throw new errors_1.AppError(503, "EMAIL_NOT_CONFIGURED", "Configure a 32-byte AUTH_EMAIL_KEY");
    return value;
}
function encryptAuthEmail(text) {
    const iv = (0, crypto_1.randomBytes)(12), cipher = (0, crypto_1.createCipheriv)("aes-256-gcm", key(), iv);
    const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body]
        .map((part) => part.toString("base64"))
        .join(".");
}
function decryptAuthEmail(value) {
    const [iv, tag, body] = value
        .split(".")
        .map((part) => Buffer.from(part, "base64"));
    const cipher = (0, crypto_1.createDecipheriv)("aes-256-gcm", key(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8");
}
function authLink(path, token) {
    if (!env_1.env.WEB_URL)
        throw new errors_1.AppError(503, "EMAIL_NOT_CONFIGURED", "Configure WEB_URL for account links");
    const base = new URL(env_1.env.WEB_URL);
    if (env_1.env.isProd && base.protocol !== "https:")
        throw new errors_1.AppError(503, "EMAIL_NOT_CONFIGURED", "Use HTTPS for account links");
    const link = new URL(path, base);
    link.hash = new URLSearchParams({ token }).toString();
    return link.toString();
}
async function enqueueAuthEmail(tx, recipient, subject, text, expiresAt) {
    return tx.authEmail.create({
        data: {
            recipient,
            subject,
            encryptedText: encryptAuthEmail(text),
            expiresAt,
        },
    });
}
function assertAuthEmailDeliveryConfigured() {
    key();
    authLink("/reset-password", "configuration-check");
    assertEmailDeliveryConfigured();
}
function assertEmailDeliveryConfigured() {
    if (env_1.env.EMAIL_PROVIDER === "brevo") {
        if (!env_1.env.BREVO_API_KEY || !(env_1.env.EMAIL_FROM || env_1.env.SMTP_USER)) {
            throw new errors_1.AppError(503, "EMAIL_NOT_CONFIGURED", "Configure BREVO_API_KEY and EMAIL_FROM (or SMTP_USER)");
        }
        return;
    }
    if (!env_1.env.EMAIL_FROM ||
        (env_1.env.EMAIL_PROVIDER === "resend" && !env_1.env.RESEND_API_KEY) ||
        (env_1.env.EMAIL_PROVIDER === "smtp" &&
            (!env_1.env.SMTP_HOST || !env_1.env.SMTP_USER || !env_1.env.SMTP_PASSWORD)) ||
        env_1.env.EMAIL_PROVIDER === "disabled") {
        throw new errors_1.AppError(503, "EMAIL_NOT_CONFIGURED", "Configure the selected email provider before starting delivery");
    }
}
exports.authEmailTransport = {
    async send(message) {
        if (env_1.env.EMAIL_PROVIDER === "brevo") {
            assertEmailDeliveryConfigured();
            await (0, mailing_1.sendEmail)({
                subject: message.subject,
                receiptent: { name: message.recipient, email: message.recipient },
                text: message.text,
            });
            return;
        }
        if (!env_1.env.EMAIL_FROM)
            throw new Error("EMAIL_CONFIGURATION");
        if (env_1.env.EMAIL_PROVIDER === "resend") {
            if (!env_1.env.RESEND_API_KEY)
                throw new Error("EMAIL_CONFIGURATION");
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env_1.env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                    "Idempotency-Key": `auth/${message.id}`,
                },
                body: JSON.stringify({
                    from: env_1.env.EMAIL_FROM,
                    to: [message.recipient],
                    subject: message.subject,
                    text: message.text,
                }),
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok)
                throw new Error("EMAIL_PROVIDER_FAILURE");
            return;
        }
        if (env_1.env.EMAIL_PROVIDER !== "smtp" ||
            !env_1.env.SMTP_HOST ||
            !env_1.env.SMTP_USER ||
            !env_1.env.SMTP_PASSWORD)
            throw new Error("EMAIL_CONFIGURATION");
        const transport = nodemailer_1.default.createTransport({
            host: env_1.env.SMTP_HOST,
            port: env_1.env.SMTP_PORT,
            secure: env_1.env.SMTP_SECURE,
            requireTLS: !env_1.env.SMTP_SECURE,
            auth: { user: env_1.env.SMTP_USER, pass: env_1.env.SMTP_PASSWORD },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
            disableFileAccess: true,
            disableUrlAccess: true,
        });
        try {
            await transport.sendMail({
                from: env_1.env.EMAIL_FROM,
                to: message.recipient,
                subject: message.subject,
                text: message.text,
                messageId: `<${message.id}@schoolos-auth>`,
            });
        }
        finally {
            transport.close();
        }
    },
};
async function processAuthEmail() {
    if (env_1.env.EMAIL_PROVIDER === "disabled")
        return { status: "disabled" };
    assertAuthEmailDeliveryConfigured();
    await prisma_1.prisma.authEmail.updateMany({
        where: {
            status: "SENDING",
            attempts: { gte: 5 },
            lockedAt: { lt: new Date(Date.now() - 90_000) },
        },
        data: { status: "FAILED", lockedAt: null },
    });
    await prisma_1.prisma.authEmail.updateMany({
        where: {
            expiresAt: { lte: new Date() },
            status: { in: ["PENDING", "SENDING", "FAILED"] },
        },
        data: { status: "EXPIRED", encryptedText: null },
    });
    const jobs = await prisma_1.prisma.$queryRaw `
    WITH candidate AS (
      SELECT "id" FROM "AuthEmail" WHERE "expiresAt" > timezone('UTC', NOW()) AND "attempts" < 5 AND
      (("status" = 'PENDING' AND "nextAttemptAt" <= timezone('UTC', NOW())) OR ("status" = 'SENDING' AND "lockedAt" < timezone('UTC', NOW()) - INTERVAL '90 seconds'))
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "AuthEmail" AS job SET "status" = 'SENDING', "lockedAt" = timezone('UTC', NOW()), "attempts" = "attempts" + 1
      FROM candidate WHERE job."id" = candidate."id" RETURNING job.*
  `;
    const job = jobs[0];
    if (!job)
        return { status: "idle" };
    // Attempts are the lease generation: stale workers cannot acknowledge a newer claim.
    try {
        await exports.authEmailTransport.send({
            ...job,
            text: decryptAuthEmail(job.encryptedText),
        });
        await prisma_1.prisma.authEmail.updateMany({
            where: { id: job.id, status: "SENDING", attempts: job.attempts },
            data: {
                status: "SENT",
                sentAt: new Date(),
                encryptedText: null,
                lockedAt: null,
            },
        });
        return { status: "sent", id: job.id };
    }
    catch {
        await prisma_1.prisma.authEmail.updateMany({
            where: { id: job.id, status: "SENDING", attempts: job.attempts },
            data: {
                status: job.attempts >= 5 ? "FAILED" : "PENDING",
                lockedAt: null,
                nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)),
            },
        });
        return { status: "retry", id: job.id };
    }
}
