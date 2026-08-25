"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORT = void 0;
const app_1 = require("./app");
exports.PORT = process.env.PORT || 9871;
(async () => {
    try {
        app_1.httpServer.listen(exports.PORT, () => {
            console.log(`Listening on port ${exports.PORT}`);
        });
    }
    catch (err) {
        console.error("Failed to start server:", err);
    }
})();
