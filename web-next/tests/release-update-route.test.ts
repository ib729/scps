import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startTestServer, type TestServer } from "./helpers/server";

test("only a same-origin administrator can queue one update, and status survives reconnecting", { timeout: 120_000 }, async () => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "scps-update-api-"));
  const key = "SCPS_UPDATE_DIR";
  const previous = process.env[key];
  let server: TestServer | undefined;
  try {
    process.env[key] = state;
    server = await startTestServer({ webpack: true });
    const base = server.baseURL;
    async function login(role: string) {
      const response = await fetch(`${base}/api/auth/sign-in/email`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ email: `${role}@example.test`, password: "scps-test-password-123" }),
      });
      assert.equal(response.status, 200);
      return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    }
    const request = (cookie: string, method: string, origin = base) => fetch(`${base}/api/system/update`, { method, headers: { Cookie: cookie, Origin: origin } });
    const admin = await login("admin");
    const staff = await login("staff");
    assert.equal((await request(staff, "POST")).status, 403);
    assert.equal((await request(admin, "POST", "https://untrusted.invalid")).status, 403);
    assert.equal((await request(admin, "POST")).status, 503);
    await fs.symlink(state, path.join(state, "current"));
    assert.deepEqual((await Promise.all([request(admin, "POST"), request(admin, "POST")])).map(r => r.status).sort(), [202, 409]);
    assert.equal((await (await request(admin, "GET")).json()).running, true);
    await fs.writeFile(path.join(state, "status.json"), JSON.stringify({ state: "rolled_back", message: "Previous release restored." }));
    await fs.unlink(path.join(state, "request"));
    const status = await (await request(admin, "GET")).json();
    assert.equal(status.running, false);
    assert.equal(status.status.state, "rolled_back");
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    await server?.close();
    await fs.rm(state, { recursive: true, force: true });
  }
});
