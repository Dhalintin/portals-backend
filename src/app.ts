import express, { Application } from "express";
import { createServer } from "http";
import indexMiddleware from "./middlewares/index.middleware";

const app: Application = express();
const httpServer = createServer(app);

indexMiddleware(app);

export { app, httpServer };
