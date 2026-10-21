"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORT = void 0;
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./lib/prisma");
const readiness_1 = require("./lib/readiness");
const startServer_1 = require("./lib/startServer");
exports.PORT = env_1.env.PORT;
(async () => {
    try {
        await (0, startServer_1.startServer)(app_1.httpServer, exports.PORT, readiness_1.readiness.checkDatabase);
        console.log(`Listening on port ${exports.PORT}`);
    }
    catch {
        console.error("Server startup failed; check database connectivity and listen configuration");
        await prisma_1.prisma.$disconnect().finally(() => process.exit(1));
    }
})();
let shuttingDown = false;
function shutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    app_1.httpServer.close(() => {
        void prisma_1.prisma.$disconnect().then(() => { clearTimeout(deadline); process.exit(0); })
            .catch((error) => { console.error("Shutdown failed", error); process.exit(1); });
    });
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
