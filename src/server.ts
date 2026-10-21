import { httpServer } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { readiness } from "./lib/readiness";
import { startServer } from "./lib/startServer";

export const PORT = env.PORT;

(async () => {
  try {
    await startServer(httpServer, PORT, readiness.checkDatabase);
    console.log(`Listening on port ${PORT}`);
  } catch {
    console.error("Server startup failed; check database connectivity and listen configuration");
    await prisma.$disconnect().finally(() => process.exit(1));
  }
})();

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  httpServer.close(() => {
    void prisma.$disconnect().then(() => { clearTimeout(deadline); process.exit(0); })
      .catch((error) => { console.error("Shutdown failed", error); process.exit(1); });
  });
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
