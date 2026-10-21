import type { Server } from "node:http";

export async function startServer(server: Server, port: number, checkDatabase: () => Promise<unknown>) {
  await checkDatabase();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); });
  });
}
