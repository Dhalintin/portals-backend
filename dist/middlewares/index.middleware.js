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
exports.default = (app) => {
    app.use((0, morgan_1.default)("combined"));
    app.use((0, cors_1.default)({
        origin: "*",
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    }));
    if (process.env.NODE_ENV !== "production")
        (0, dotenv_1.configDotenv)();
    app.use((0, express_1.json)({ limit: "900mb" }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: "900mb" }));
    // app.use(json());
    // app.use(urlencoded({ extended: true }));
    app.use((0, helmet_1.default)());
    app.use((0, cookie_parser_1.default)());
    app.use("/api/v1", appRoutes_1.default);
};
