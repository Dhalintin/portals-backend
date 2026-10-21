import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "./prisma";
import { AppError } from "./errors";

function key() {
  const value = Buffer.from(env.AUTH_EMAIL_KEY ?? "", "base64");
  if (value.length !== 32) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Configure a 32-byte AUTH_EMAIL_KEY");
  return value;
}
export function encryptAuthEmail(text: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString("base64")).join(".");
}
export function decryptAuthEmail(value: string) {
  const [iv, tag, body] = value.split(".").map(part => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv!); cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(body!), cipher.final()]).toString("utf8");
}
export function authLink(path: string, token: string) {
  if (!env.WEB_URL) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Configure WEB_URL for account links");
  const base = new URL(env.WEB_URL);
  if (env.isProd && base.protocol !== "https:") throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Use HTTPS for account links");
  const link = new URL(path, base); link.hash = new URLSearchParams({ token }).toString();
  return link.toString();
}
export async function enqueueAuthEmail(tx: Prisma.TransactionClient, recipient: string, subject: string, text: string, expiresAt: Date) {
  return tx.authEmail.create({ data: { recipient, subject, encryptedText: encryptAuthEmail(text), expiresAt } });
}
export function assertAuthEmailDeliveryConfigured() {
  key(); authLink("/reset-password", "configuration-check");
  assertEmailDeliveryConfigured();
}
export function assertEmailDeliveryConfigured() {
  if (!env.EMAIL_FROM || (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) ||
      (env.EMAIL_PROVIDER === "smtp" && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD)) || env.EMAIL_PROVIDER === "disabled") {
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Configure the selected email provider before starting delivery");
  }
}
export const authEmailTransport = {
  async send(message: { id: string; recipient: string; subject: string; text: string }) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_CONFIGURATION");
    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) throw new Error("EMAIL_CONFIGURATION");
      const response = await fetch("https://api.resend.com/emails", { method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `auth/${message.id}` },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.recipient], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("EMAIL_PROVIDER_FAILURE");
      return;
    }
    if (env.EMAIL_PROVIDER !== "smtp" || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) throw new Error("EMAIL_CONFIGURATION");
    const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      disableFileAccess: true, disableUrlAccess: true });
    try { await transport.sendMail({ from: env.EMAIL_FROM, to: message.recipient, subject: message.subject,
      text: message.text, messageId: `<${message.id}@schoolos-auth>` }); } finally { transport.close(); }
  },
};

export async function processAuthEmail() {
  if (env.EMAIL_PROVIDER === "disabled") return { status: "disabled" };
  assertAuthEmailDeliveryConfigured();
  await prisma.authEmail.updateMany({ where: { status: "SENDING", attempts: { gte: 5 }, lockedAt: { lt: new Date(Date.now() - 90_000) } },
    data: { status: "FAILED", lockedAt: null } });
  await prisma.authEmail.updateMany({ where: { expiresAt: { lte: new Date() }, status: { in: ["PENDING", "SENDING", "FAILED"] } },
    data: { status: "EXPIRED", encryptedText: null } });
  const jobs = await prisma.$queryRaw<Array<{ id: string; recipient: string; subject: string; encryptedText: string; attempts: number; lockedAt: Date }>>`
    WITH candidate AS (
      SELECT "id" FROM "AuthEmail" WHERE "expiresAt" > timezone('UTC', NOW()) AND "attempts" < 5 AND
      (("status" = 'PENDING' AND "nextAttemptAt" <= timezone('UTC', NOW())) OR ("status" = 'SENDING' AND "lockedAt" < timezone('UTC', NOW()) - INTERVAL '90 seconds'))
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "AuthEmail" AS job SET "status" = 'SENDING', "lockedAt" = timezone('UTC', NOW()), "attempts" = "attempts" + 1
      FROM candidate WHERE job."id" = candidate."id" RETURNING job.*
  `;
  const job = jobs[0]; if (!job) return { status: "idle" };
  // Attempts are the lease generation: stale workers cannot acknowledge a newer claim.
  try {
    await authEmailTransport.send({ ...job, text: decryptAuthEmail(job.encryptedText) });
    await prisma.authEmail.updateMany({ where: { id: job.id, status: "SENDING", attempts: job.attempts },
      data: { status: "SENT", sentAt: new Date(), encryptedText: null, lockedAt: null } });
    return { status: "sent", id: job.id };
  } catch {
    await prisma.authEmail.updateMany({ where: { id: job.id, status: "SENDING", attempts: job.attempts },
      data: { status: job.attempts >= 5 ? "FAILED" : "PENDING", lockedAt: null,
        nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)) } });
    return { status: "retry", id: job.id };
  }
}
