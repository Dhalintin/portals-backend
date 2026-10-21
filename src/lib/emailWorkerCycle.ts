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
    try { await task(); } catch { failures++; }
  }
  return { failures };
}
