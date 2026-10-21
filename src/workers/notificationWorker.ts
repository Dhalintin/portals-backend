import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { communicationService } from "../features/communication/communication.service";
import { processNotificationEmail } from "../lib/notificationDelivery";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { assertEmailDeliveryConfigured } from "../lib/authEmail";
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function run() {
  if (env.EMAIL_PROVIDER !== "disabled") assertEmailDeliveryConfigured();
  while (!stopping) {
    try { await communicationService.publishScheduledAnnouncements(); await processNotificationEmail(); }
    catch { console.error("Notification worker failed; retrying without logging recipients or message contents"); }
    if (!stopping) await setTimeout(2000);
  }
}
run().catch(() => { console.error("Notification worker could not start"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
