import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestServer } from "./helpers/server";

test("protected HTTP requests reject revoked or expired original cookies and customer roles", async () => {
  const server = await startTestServer();
  try {
    async function login(email: string) {
      const response = await fetch(`${server.baseURL}/api/auth/sign-in/email`, { method:"POST", headers:{"Content-Type":"application/json",Origin:server.baseURL}, body:JSON.stringify({email,password:"scps-test-password-123"}) });
      assert.equal(response.status,200);
      return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
    }
    const cookie = await login("staff@example.test");
    const get = (cookie: string) => fetch(`${server.baseURL}/api/transactions`, {headers:{Cookie:cookie}});
    assert.equal((await get(cookie)).status,200);
    server.database.exec("DELETE FROM session WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
    assert.equal((await get(cookie)).status,401);
    const fresh = await login("staff@example.test");
    assert.equal((await get(fresh)).status,200);
    server.database.exec("UPDATE session SET expiresAt=0 WHERE userId=(SELECT id FROM user WHERE email='staff@example.test')");
    assert.equal((await get(fresh)).status,401);
    assert.equal((await get(await login("customer@example.test"))).status,403);
  } finally { await server.close(); }
});
