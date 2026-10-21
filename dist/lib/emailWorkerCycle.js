"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorkerCycle = emailWorkerCycle;
const authEmail_1 = require("./authEmail");
const notificationDelivery_1 = require("./notificationDelivery");
const communication_service_1 = require("../features/communication/communication.service");
async function emailWorkerCycle() {
    let failures = 0;
    // Isolate failures so a problem publishing notices cannot stop password resets.
    const tasks = [
        () => (0, authEmail_1.processAuthEmail)(),
        () => communication_service_1.communicationService.publishScheduledAnnouncements(),
        () => (0, notificationDelivery_1.processNotificationEmail)(),
    ];
    for (const task of tasks) {
        try {
            await task();
        }
        catch {
            failures++;
        }
    }
    return { failures };
}
