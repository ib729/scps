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
