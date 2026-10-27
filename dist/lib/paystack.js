"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPaystackSignature = verifyPaystackSignature;
exports.paystackRequest = paystackRequest;
exports.initializeTransaction = initializeTransaction;
exports.verifyTransaction = verifyTransaction;
const crypto_1 = __importDefault(require("crypto"));
const errors_1 = require("./errors");
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const BASE = "https://api.paystack.co";
function verifyPaystackSignature(rawBody, signature) {
    if (!SECRET)
        throw new errors_1.AppError(503, "PAYMENTS_UNAVAILABLE", "Paystack is not configured");
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature))
        return false;
    const hash = crypto_1.default
        .createHmac("sha512", SECRET)
        .update(rawBody)
        .digest("hex");
    return crypto_1.default.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(signature, "hex"));
}
async function paystackRequest(path, options = {}) {
    if (!SECRET)
        throw new errors_1.AppError(503, "PAYMENTS_UNAVAILABLE", "Paystack is not configured");
    const res = await fetch(`${BASE}${path}`, {
        method: options.method || "GET",
        headers: {
            Authorization: `Bearer ${SECRET}`,
            "Content-Type": "application/json",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    if (!res.ok || !data.status) {
        throw new errors_1.AppError(502, "PAYSTACK_ERROR", data.message || "Paystack request failed");
    }
    return data.data;
}
async function initializeTransaction(params) {
    return paystackRequest("/transaction/initialize", {
        method: "POST",
        body: {
            email: params.email,
            amount: params.amountKobo,
            reference: params.reference,
            callback_url: params.callback_url,
            metadata: params.metadata,
            currency: "NGN",
            ...(params.subaccount ? { subaccount: params.subaccount, bearer: "subaccount" } : {}),
        },
    });
}
async function verifyTransaction(reference) {
    return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}
