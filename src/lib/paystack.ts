import crypto from "crypto";
import { AppError } from "./errors";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE = "https://api.paystack.co";

export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | undefined
) {
  if (!SECRET) throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Paystack is not configured");
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const hash = crypto
    .createHmac("sha512", SECRET)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(signature, "hex"));
}

export async function paystackRequest<T>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  if (!SECRET) throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Paystack is not configured");
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const data: any = await res.json();
  if (!res.ok || !data.status) {
    throw new AppError(
      502,
      "PAYSTACK_ERROR",
      data.message || "Paystack request failed"
    );
  }
  return data.data as T;
}

export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callback_url?: string;
  subaccount?: string;
  metadata?: Record<string, any>;
}) {
  return paystackRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
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

export async function verifyTransaction(reference: string) {
  return paystackRequest<{
    status: string; // "success" | "failed" | "abandoned" ...
    amount: number; // kobo
    currency: string;
    reference: string;
    paid_at?: string;
    metadata?: any;
    gateway_response?: string;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}
