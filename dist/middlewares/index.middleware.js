"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dotenv_1 = require("dotenv");
const morgan_1 = __importDefault(require("morgan"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const appRoutes_1 = __importDefault(require("../features/appRoutes"));
const env_1 = require("../config/env");
const requestId_1 = require("./requestId");
const rateLimit_1 = require("./rateLimit");
const fees_controller_1 = require("../features/fees/fees.controller");
exports.default = (app) => {
    app.set("trust proxy", env_1.env.TRUST_PROXY);
    app.use(requestId_1.requestId);
    app.use((0, helmet_1.default)());
    app.use((0, morgan_1.default)("combined"));
    app.use((0, cors_1.default)({
        origin: env_1.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
        exposedHeaders: ["X-Request-Id"],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    }));
    if (process.env.NODE_ENV === "development")
        (0, dotenv_1.configDotenv)();
    app.post("/api/v1/payments/webhook", rateLimit_1.webhookLimiter, (0, express_1.raw)({ type: "application/json", limit: "1mb" }), (req, _res, next) => {
        req.rawBody = req.body;
        next();
    }, fees_controller_1.feesController.webhook);
    app.use((0, express_1.json)({ limit: "2mb" }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: "2mb" }));
    // app.use(json());
    // app.use(urlencoded({ extended: true }));
    app.use((0, helmet_1.default)());
    app.use((0, cookie_parser_1.default)());
    app.use("/api/v1", appRoutes_1.default);
};
