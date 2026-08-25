import "dotenv/config";
import express, { Application } from "express";
import { createServer } from "http";
import indexMiddleware from "./middlewares/index.middleware";
import { notFound } from "./common/middleware/notFound";
import { errorHandler } from "./common/middleware/errorHandler";
import { hashPassword } from "./lib/password";

const app: Application = express();
const httpServer = createServer(app);

indexMiddleware(app);

app.use(notFound);
app.use(errorHandler);

export { app, httpServer };
