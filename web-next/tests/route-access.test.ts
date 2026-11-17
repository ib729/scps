import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestServer } from "./helpers/server";

test("legacy page redirects preserve suffixes and queries without redirecting POST actions", async () => {
  const server = await startTestServer();
  try {
    for (const [oldPath, canonical] of [
      ["/dashboard?from=old", "/admin?from=old"],
      ["/customers/2?note=a%20b&customer=2&customer=3", "/admin/customers/2?note=a%20b&customer=2&customer=3"],
      ["/students/2?note=a%20b", "/admin/customers/2?note=a%20b"],
      ["/student/pending?from=old", "/customer/pending?from=old"],
      ["/pos?card=ABCD", "/admin/pos?card=ABCD"],
      ["/wcp", "/admin/payments"],
    ]) {
      const response = await fetch(server.baseURL + oldPath, { redirect: "manual" });
      assert.equal(response.status, 308, oldPath);
      const destination = new URL(response.headers.get("location")!, server.baseURL);
      const expected = new URL(canonical, server.baseURL);
      assert.equal(destination.origin + destination.pathname, expected.origin + expected.pathname);
      assert.deepEqual([...destination.searchParams], [...expected.searchParams]);
    }
    const posted = await fetch(server.baseURL + "/student", {
      method: "POST", redirect: "manual",
      headers: { "Content-Type": "text/plain;charset=UTF-8", "Next-Action": "not-a-real-action", Origin: server.baseURL },
      body: "[]",
    });
    assert.ok(posted.status >= 400 && posted.status < 500);
    assert.equal(posted.headers.get("location"), null);
  } finally { await server.close(); }
});

test("customer and payment-review pages stay unavailable while staff admin pages remain accessible", async () => {
  const server = await startTestServer({ webpack: true });
  try {
    async function login(email: string) {
      const response = await fetch(`${server.baseURL}/api/auth/sign-in/email`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: server.baseURL },
        body: JSON.stringify({ email, password: "scps-test-password-123" }),
      });
      assert.equal(response.status, 200);
      return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
    }
    const staff = await login("staff@example.test");
    const admin = await login("admin@example.test");
    const customer = await login("customer@example.test");
    for (const cookie of [undefined, staff, admin, customer]) {
      for (const route of ["/customer", "/customer/pending", "/admin/payments"]) {
        const response = await fetch(server.baseURL + route, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
        assert.equal(response.status, 404, `${route} must be unavailable`);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    }
    for (const route of ["/customer", "/admin/payments"]) {
      assert.equal((await fetch(server.baseURL + route, { method: "HEAD", redirect: "manual" })).status, 404);
    }
    assert.equal((await fetch(server.baseURL + "/signup")).status, 200);
    for (const [route, cookie] of [["/admin", staff], ["/admin/topup", staff], ["/admin", admin]] as const) {
      const response = await fetch(server.baseURL + route, { headers: { Cookie: cookie }, redirect: "manual" });
      assert.equal(response.status, 200, `${route} must remain available`);
    }
  } finally {
    await server.close();
  }
});

test("unapproved accounts can check access but cannot use staff data", async () => {
  const server = await startTestServer({ webpack: true });
  try {
    const login = await fetch(`${server.baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: server.baseURL },
      body: JSON.stringify({ email: "customer@example.test", password: "scps-test-password-123" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const headers = { Cookie: cookie };
    const home = await fetch(server.baseURL + "/", { headers, redirect: "manual" });
    assert.equal(new URL(home.headers.get("location")!, server.baseURL).pathname, "/pending");
    assert.equal((await fetch(server.baseURL + "/pending", { headers })).status, 200);
    assert.equal((await fetch(server.baseURL + "/api/transactions", { headers })).status, 403);
    server.database.prepare("UPDATE user SET role = 'staff' WHERE email = ?").run("customer@example.test");
    const approved = await fetch(server.baseURL + "/", { headers, redirect: "manual" });
    assert.equal(new URL(approved.headers.get("location")!, server.baseURL).pathname, "/admin");
    assert.equal((await fetch(server.baseURL + "/api/transactions", { headers })).status, 200);
  } finally {
    await server.close();
  }
});

test("retired finance routes return 404 for operators without attachments", async () => {
  const server = await startTestServer({ webpack: true });
  try {
    for (const email of ["staff@example.test", "admin@example.test"]) {
      const login = await fetch(`${server.baseURL}/api/auth/sign-in/email`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: server.baseURL },
        body: JSON.stringify({ email, password: "scps-test-password-123" }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      for (const route of ["/admin/finance", "/finance/instant?month=2020-10", "/finance/reports/1", "/api/finance/instant/export?month=2020-10", "/api/finance/reports/1/export"]) {
        const response = await fetch(server.baseURL + route, { headers: { Cookie: cookie }, redirect: "manual" });
        assert.equal(response.status, 404, `${email} ${route}`);
        assert.doesNotMatch(response.headers.get("content-disposition") ?? "", /attachment/i);
      }
    }
  } finally {
    await server.close();
  }
});
