"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:timers/promises");
const communication_service_1 = require("../features/communication/communication.service");
const notificationDelivery_1 = require("../lib/notificationDelivery");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const authEmail_1 = require("../lib/authEmail");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
async function run() {
    if (env_1.env.EMAIL_PROVIDER !== "disabled")
        (0, authEmail_1.assertEmailDeliveryConfigured)();
    while (!stopping) {
        try {
            await communication_service_1.communicationService.publishScheduledAnnouncements();
            await (0, notificationDelivery_1.processNotificationEmail)();
        }
        catch {
            console.error("Notification worker failed; retrying without logging recipients or message contents");
        }
        if (!stopping)
            await (0, promises_1.setTimeout)(2000);
    }
}
run().catch(() => { console.error("Notification worker could not start"); process.exitCode = 1; }).finally(() => prisma_1.prisma.$disconnect());
