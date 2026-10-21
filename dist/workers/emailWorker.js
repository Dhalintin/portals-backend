"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:timers/promises");
const emailWorkerCycle_1 = require("../lib/emailWorkerCycle");
const authEmail_1 = require("../lib/authEmail");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });
async function run() {
    if (env_1.env.EMAIL_PROVIDER === "disabled")
        throw new Error("Enable email delivery before starting the email worker");
    (0, authEmail_1.assertAuthEmailDeliveryConfigured)();
    while (!stopping) {
        const { failures } = await (0, emailWorkerCycle_1.emailWorkerCycle)();
        if (failures)
            console.error("Email worker cycle had failures; retrying without logging recipients or message contents");
        if (!stopping)
            await (0, promises_1.setTimeout)(2000);
    }
}
run().catch(() => { console.error("Email worker could not start"); process.exitCode = 1; }).finally(() => prisma_1.prisma.$disconnect());
