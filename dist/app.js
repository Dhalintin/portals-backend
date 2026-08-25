"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.app = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const index_middleware_1 = __importDefault(require("./middlewares/index.middleware"));
const notFound_1 = require("./common/middleware/notFound");
const errorHandler_1 = require("./common/middleware/errorHandler");
const app = (0, express_1.default)();
exports.app = app;
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
(0, index_middleware_1.default)(app);
app.use(notFound_1.notFound);
app.use(errorHandler_1.errorHandler);
