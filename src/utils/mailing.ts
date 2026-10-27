import { BrevoClient } from "@getbrevo/brevo";
import "dotenv/config";

export async function sendEmail({ subject, receiptent, content, text }: {
  subject: string;
  receiptent: { name: string; email: string };
  content?: string;
  text?: string;
}) {
  const sender = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!process.env.BREVO_API_KEY || !sender) throw new Error("EMAIL_CONFIGURATION");
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
  try {
    return await brevo.transactionalEmails.sendTransacEmail({
      subject,
      ...(content ? { htmlContent: content } : {}),
      ...(text ? { textContent: text } : {}),
      sender: { name: "Schoolos", email: sender },
      to: [receiptent],
    });
  } catch (error) {
    const status = (error as { statusCode?: unknown })?.statusCode;
    console.error("Brevo rejected the email request", typeof status === "number" ? `HTTP ${status}` : "(network or provider error)");
    // Let queued emails retry without logging private links or credentials.
    throw new Error("EMAIL_PROVIDER_FAILURE");
  }
}
