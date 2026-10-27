import { BrevoClient } from "@getbrevo/brevo";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  subject,
  receiptent,
  content,
}: {
  subject: string;
  receiptent: { name: string; email: string };
  content: string;
}) {
  try {
    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: subject,
      htmlContent: content,
      sender: {
        name: "Schoolos",
        email: process.env.SMTP_USER!,
      },
      to: [receiptent],
    });

    console.log("Email sent! Message ID:", result.messageId);
  } catch (error) {
    console.error("Error:", error);
  }
}
