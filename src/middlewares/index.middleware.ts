import { Application, json, raw, urlencoded } from "express";
import { configDotenv } from "dotenv";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import appRouter from "../features/appRoutes";
import { env } from "../config/env";
import { requestId } from "./requestId";
import { webhookLimiter } from "./rateLimit";
import { feesController } from "../features/fees/fees.controller";

export default (app: Application) => {
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(requestId);
  app.use(helmet());
  app.use(morgan("combined"));

  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })
  );

  if (process.env.NODE_ENV === "development") configDotenv();

  app.post(
    "/api/v1/payments/webhook",
    webhookLimiter,
    raw({ type: "application/json", limit: "1mb" }),
    (req, _res, next) => {
      (req as any).rawBody = req.body;
      next();
    },
    feesController.webhook
  );
  app.use(json({ limit: "2mb" }));
  app.use(urlencoded({ extended: true, limit: "2mb" }));
  // app.use(json());
  // app.use(urlencoded({ extended: true }));

  app.use(helmet());

  app.use(cookieParser());

  app.use("/api/v1", appRouter);
};
