import { Application, json, urlencoded } from "express";
import { configDotenv } from "dotenv";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import indexRoutes from "../features/appRoute";

export default (app: Application) => {
  app.use(morgan("combined"));

  app.use(
    cors({
      origin: "*",
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })
  );

  if (process.env.NODE_ENV !== "production") configDotenv();

  app.use(json({ limit: "900mb" }));
  app.use(urlencoded({ extended: true, limit: "900mb" }));
  // app.use(json());
  // app.use(urlencoded({ extended: true }));

  app.use(helmet());

  app.use(cookieParser());

  app.use("/api/v1", indexRoutes);
};
