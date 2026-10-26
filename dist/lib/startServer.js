"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
async function startServer(server, port, checkDatabase) {
    await checkDatabase();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
            server.removeListener("error", reject);
            resolve();
        });
    });
}
