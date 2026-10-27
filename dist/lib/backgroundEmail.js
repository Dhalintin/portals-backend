"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBackgroundEmail = startBackgroundEmail;
const env_1 = require("../config/env");
const errors_1 = require("./errors");
const authEmail_1 = require("./authEmail");
const emailWorkerCycle_1 = require("./emailWorkerCycle");
// Run the existing queue with the API so a separate worker is not required.
function startBackgroundEmail() {
    if (env_1.env.EMAIL_PROVIDER === "disabled") {
        console.info("Email delivery disabled: set EMAIL_PROVIDER=brevo to enable it");
        return () => { };
    }
    try {
        (0, authEmail_1.assertAuthEmailDeliveryConfigured)();
    }
    catch (error) {
        console.error("Email delivery could not start:", error instanceof errors_1.AppError ? error.message : "Check email configuration");
        return () => { };
    }
    let stopped = false;
    let timer;
    async function tick() {
        try {
            const { failures } = await (0, emailWorkerCycle_1.emailWorkerCycle)();
            if (failures)
                console.error("Email queue could not complete a cycle; check database and email configuration");
        }
        catch {
            console.error("Email queue failed; retrying shortly");
        }
        // Schedule after completion so slow requests never overlap within this process.
        if (!stopped) {
            timer = setTimeout(() => { void tick(); }, 2000);
            timer.unref();
        }
    }
    console.info(`Email delivery started (${env_1.env.EMAIL_PROVIDER})`);
    void tick();
    return () => { stopped = true; if (timer)
        clearTimeout(timer); };
}
