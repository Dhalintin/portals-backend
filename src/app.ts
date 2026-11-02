import "dotenv/config";
import express, { Application } from "express";
import { createServer } from "http";
import indexMiddleware from "./middlewares/index.middleware";
import { notFound } from "./common/middleware/notFound";
import { errorHandler } from "./common/middleware/errorHandler";
import dotenv from "dotenv";

dotenv.config();

const app: Application = express();
// Student relations appear in several responses. Never serialize activation hashes.
app.set('json replacer', (key: string, value: unknown) => key === 'activationCodeHash' ? undefined : value);
const httpServer = createServer(app);

indexMiddleware(app);

app.use(notFound);
app.use(errorHandler);

export { app, httpServer };
