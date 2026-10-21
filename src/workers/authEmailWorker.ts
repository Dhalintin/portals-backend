import "dotenv/config";
import { setTimeout } from "timers/promises";
import { processAuthEmail, assertAuthEmailDeliveryConfigured } from "../lib/authEmail";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function run() {
  if (env.EMAIL_PROVIDER === "disabled") throw new Error("Select EMAIL_PROVIDER=smtp or resend before starting the auth email worker");
  assertAuthEmailDeliveryConfigured();
  while (!stopping) {
    try { await processAuthEmail(); } catch { console.error("Auth email worker failed; retrying without logging credentials or links"); }
    if (!stopping) await setTimeout(2000);
  }
}
run().catch(() => { console.error("Auth email worker could not start"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
