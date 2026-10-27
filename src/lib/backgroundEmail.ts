import { env } from "../config/env";
import { AppError } from "./errors";
import { assertAuthEmailDeliveryConfigured } from "./authEmail";
import { emailWorkerCycle } from "./emailWorkerCycle";

// Run the existing queue with the API so a separate worker is not required.
export function startBackgroundEmail() {
  if (env.EMAIL_PROVIDER === "disabled") {
    console.info("Email delivery disabled: set EMAIL_PROVIDER=brevo to enable it");
    return () => {};
  }
  try {
    assertAuthEmailDeliveryConfigured();
  } catch (error) {
    console.error("Email delivery could not start:", error instanceof AppError ? error.message : "Check email configuration");
    return () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    try {
      const { failures } = await emailWorkerCycle();
      if (failures) console.error("Email queue could not complete a cycle; check database and email configuration");
    } catch {
      console.error("Email queue failed; retrying shortly");
    }
    // Schedule after completion so slow requests never overlap within this process.
    if (!stopped) {
      timer = setTimeout(() => { void tick(); }, 2000);
      timer.unref();
    }
  }
  console.info(`Email delivery started (${env.EMAIL_PROVIDER})`);
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
