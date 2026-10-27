"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const brevo_1 = require("@getbrevo/brevo");
require("dotenv/config");
async function sendEmail({ subject, receiptent, content, text }) {
    const sender = process.env.EMAIL_FROM || process.env.SMTP_USER;
    if (!process.env.BREVO_API_KEY || !sender)
        throw new Error("EMAIL_CONFIGURATION");
    const brevo = new brevo_1.BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    try {
        return await brevo.transactionalEmails.sendTransacEmail({
            subject,
            ...(content ? { htmlContent: content } : {}),
            ...(text ? { textContent: text } : {}),
            sender: { name: "Schoolos", email: sender },
            to: [receiptent],
        });
    }
    catch {
        // Let queued emails retry without logging private links or credentials.
        throw new Error("EMAIL_PROVIDER_FAILURE");
    }
}
