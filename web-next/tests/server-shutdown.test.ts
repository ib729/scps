import { test } from "node:test";
import { once } from "node:events";
import WebSocket from "ws";
import { startTestServer } from "./helpers/server";

test("SIGTERM closes an active NFC socket and exits cleanly", async () => {
  const server = await startTestServer();
  const socket = new WebSocket(`${server.baseURL.replace(/^http/, "ws")}/api/nfc/ws`);
  try {
    await once(socket, "open");
    const disconnected = once(socket, "close");
    await server.close();
    await disconnected;
  } finally {
    socket.terminate();
    await server.close();
  }
});
