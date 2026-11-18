import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
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

test("SIGTERM exits cleanly even with an unfinished HTTP request", async () => {
  const server = await startTestServer();
  const { hostname, port } = new URL(server.baseURL);
  const socket = connect({ host: hostname, port: Number(port) });
  try {
    await once(socket, "connect");
    const continued = once(socket, "data", { signal: AbortSignal.timeout(3000) });
    socket.write("POST /api/auth/sign-in/email HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 80\r\nExpect: 100-continue\r\n\r\n");
    assert.match(String((await continued)[0]), /^HTTP\/1\.1 100 Continue/);
    const disconnected = Promise.withResolvers<void>();
    socket.once("close", () => disconnected.resolve());
    socket.on("error", error => {
      if (!("code" in error) || error.code !== "ECONNRESET") disconnected.reject(error);
    });
    await Promise.all([server.close(), disconnected.promise]);
  } finally {
    socket.destroy();
    await server.close();
  }
});
