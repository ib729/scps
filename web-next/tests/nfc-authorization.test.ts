import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import WebSocket from "ws";
import { startTestServer } from "./helpers/server";

const waitMessage = async (ws: WebSocket) => JSON.parse(String((await once(ws,"message",{signal:AbortSignal.timeout(5000)}))[0]));
test("open browser sockets stop receiving NFC identifiers when their exact session loses staff access", async () => {
  const server = await startTestServer();
  const sockets: WebSocket[] = [];
  let uid = 0;
  try {
    async function login(email = "staff@example.test") {
      const response = await fetch(server.baseURL+"/api/auth/sign-in/email",{method:"POST",headers:{"Content-Type":"application/json",Origin:server.baseURL},body:JSON.stringify({email,password:"scps-test-password-123"})});
      assert.equal(response.status,200);
      return response.headers.getSetCookie().map(cookie=>cookie.split(";")[0]).join("; ");
    }
    async function socket(cookie?: string, lane = "reader-1", role = "client") {
      const ws = new WebSocket(server.baseURL.replace("http:","ws:")+`/api/nfc/ws?lane=${lane}`,{headers:{Origin:server.baseURL,...(cookie?{Cookie:cookie}:{})}});
      sockets.push(ws);await once(ws,"open");
      const reply = waitMessage(ws);
      ws.send(JSON.stringify({type:"auth",role,secret:"scps-test-only-nfc-secret-2026",lane}));
      return {ws,reply:await reply};
    }
    const reader = (await socket(undefined,"reader-1","broadcaster")).ws;
    const sendTap = (lane = "reader-1") => {const card_uid = `CARD${++uid}`;reader.send(JSON.stringify({type:"tap",card_uid,lane}));return card_uid;};
    for (const reason of ["demotion","session deletion","expiry","malformed expiry","password reset","user deletion"]) {
      server.database.exec("UPDATE user SET role='staff' WHERE email='staff@example.test'");
      const cookie = await login();
      const client = await socket(cookie);
      assert.equal(client.reply.type,"auth_success");
      const tap = waitMessage(client.ws);sendTap("reader-2");const matching = sendTap();
      assert.equal((await tap).card_uid,matching);
      if (reason === "demotion") server.database.exec("UPDATE user SET role='student' WHERE email='staff@example.test'");
      if (reason === "session deletion") server.database.exec("DELETE FROM session WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
      if (reason === "expiry") server.database.exec("UPDATE session SET expiresAt=0 WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
      if (reason === "malformed expiry") server.database.exec("UPDATE session SET expiresAt='nonsense' WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
      if (reason === "password reset") {
        // DB-dependent CLI import follows startTestServer's isolated database setup.
        const {resetCliPassword} = await import("../app/cli/auth-commands");
        const id = server.database.prepare("SELECT id FROM user WHERE email='staff@example.test'").pluck().get() as string;
        await resetCliPassword(server.database,id,"scps-test-password-123");
      }
      if (reason === "user deletion") server.database.exec("DELETE FROM user WHERE email='staff@example.test'");
      const messages: unknown[]=[];client.ws.on("message",data=>messages.push(JSON.parse(String(data))));
      const closed = once(client.ws,"close",{signal:AbortSignal.timeout(5000)});sendTap();
      assert.equal((await closed)[0],1008,reason);assert.deepEqual(messages,[],reason);
    }
    const admin = await login("admin@example.test");
    const duplicate = await socket(admin);const closed = once(duplicate.ws,"close",{signal:AbortSignal.timeout(5000)});
    duplicate.ws.send(JSON.stringify({type:"auth",role:"client"}));assert.equal((await closed)[0],1008);
    for (const cookie of [await login("student@example.test"), "better-auth.session_token=unsigned", "better-auth.session_token=%ZZ", "better-auth.session_token=fake."+"a".repeat(43)+"="]) {
      const denied = await socket(cookie);assert.equal(denied.reply.type,"auth_failed");
    }
    for (const expiry of [Math.floor(Date.now()/1000)+3600,Date.now()+3600000,new Date(Date.now()+3600000).toISOString()]) {
      server.database.prepare("UPDATE session SET expiresAt=? WHERE userId=(SELECT id FROM user WHERE email='admin@example.test')").run(expiry);
      const client=await socket(admin);assert.equal(client.reply.type,"auth_success");client.ws.close();
    }
  } finally {
    await Promise.all(sockets.filter(ws=>ws.readyState!==WebSocket.CLOSED).map(async ws=>{const closed=once(ws,"close");ws.terminate();await closed;}));
    await server.close();
  }
});
