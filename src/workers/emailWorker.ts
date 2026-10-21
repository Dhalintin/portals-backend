import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { emailWorkerCycle } from "../lib/emailWorkerCycle";
import { assertAuthEmailDeliveryConfigured } from "../lib/authEmail";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });
async function run() {
  if (env.EMAIL_PROVIDER === "disabled") throw new Error("Enable email delivery before starting the email worker");
  assertAuthEmailDeliveryConfigured();
  while (!stopping) {
    const { failures } = await emailWorkerCycle();
    if (failures) console.error("Email worker cycle had failures; retrying without logging recipients or message contents");
    if (!stopping) await setTimeout(2000);
  }
}
run().catch(() => { console.error("Email worker could not start"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
