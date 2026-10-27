import { processAuthEmail } from "./authEmail";
import { processNotificationEmail } from "./notificationDelivery";
import { communicationService } from "../features/communication/communication.service";

export async function emailWorkerCycle() {
  let failures = 0;
  // Isolate failures so a problem publishing notices cannot stop password resets.
  const tasks = [
    () => processAuthEmail(),
    () => communicationService.publishScheduledAnnouncements(),
    () => processNotificationEmail(),
  ];
  for (const task of tasks) {
    try {
      const result = await task();
      if (result && typeof result === "object" && "status" in result && result.status === "retry") {
        console.error("Email delivery failed; queued for retry. Check the provider status in the mail log.");
      }
    } catch { failures++; }
  }
  return { failures };
}
