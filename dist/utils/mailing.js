"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const brevo_1 = require("@getbrevo/brevo");
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const brevo = new brevo_1.BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
});
const transporter = nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
async function sendEmail({ subject, receiptent, content, }) {
    try {
        const result = await brevo.transactionalEmails.sendTransacEmail({
            subject: subject,
            htmlContent: content,
            sender: {
                name: "Schoolos",
                email: process.env.SMTP_USER,
            },
            to: [receiptent],
        });
        console.log("Email sent! Message ID:", result.messageId);
    }
    catch (error) {
        console.error("Error:", error);
    }
}
