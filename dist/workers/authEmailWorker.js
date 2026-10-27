"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("timers/promises");
const authEmail_1 = require("../lib/authEmail");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function run() {
    if (env_1.env.EMAIL_PROVIDER === "disabled")
        throw new Error("Select EMAIL_PROVIDER=brevo, smtp or resend before starting the auth email worker");
    (0, authEmail_1.assertAuthEmailDeliveryConfigured)();
    while (!stopping) {
        try {
            await (0, authEmail_1.processAuthEmail)();
        }
        catch {
            console.error("Auth email worker failed; retrying without logging credentials or links");
        }
        if (!stopping)
            await (0, promises_1.setTimeout)(2000);
    }
}
run().catch(() => { console.error("Auth email worker could not start"); process.exitCode = 1; }).finally(() => prisma_1.prisma.$disconnect());
