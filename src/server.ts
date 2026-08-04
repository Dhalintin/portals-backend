import { httpServer } from "./app";

export const PORT = process.env.PORT || 9871;

(async () => {
  try {
    httpServer.listen(PORT, () => {
      console.log(`Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
})();
