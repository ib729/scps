import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const webDirectory = path.resolve(import.meta.dirname, "../..");

export async function startTestServer(): Promise<{ baseURL: string; database: Database.Database; close(): Promise<void> }> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-http-"));
  const databasePath = path.join(directory, "stuco.db");
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(webDirectory, "../migrations/schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(webDirectory, "migrations/better_auth_schema.sql"), "utf8"));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = databasePath;
  try {
    // db.ts resolves DATABASE_PATH on import, after this disposable database exists.
    const { createCliUser } = await import("../../app/cli/auth-commands");
    for (const role of ["admin", "staff", "student"] as const) {
      const id = await createCliUser(database, role, `${role}@example.test`, "scps-test-password-123", role === "student" ? "staff" : role);
      if (role === "student") database.prepare("UPDATE user SET role='student' WHERE id=?").run(id);
    }
  } catch (error) {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
  }
  database.exec(`
    INSERT INTO students(id,name) VALUES(1,'Overdraft Check'),(2,'Funded Check');
    INSERT INTO accounts(student_id,balance,max_overdraft_week) VALUES(1,0,1000),(2,1000,0);
    INSERT INTO cards(card_uid,student_id) VALUES('A1B2C3D4',1),('B1C2D3E4',2);
    INSERT INTO transactions(student_id,type,amount) VALUES(2,'TOPUP',1000);
  `);
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as net.AddressInfo).port;
  const closing = Promise.withResolvers<void>();
  listener.close(error => error ? closing.reject(error) : closing.resolve());
  await closing.promise;
  const baseURL = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: webDirectory,
    env: {
      ...process.env, NODE_ENV: "development", HOSTNAME: "localhost", PORT: String(port), DATABASE_PATH: databasePath,
      BETTER_AUTH_SECRET: "scps-test-only-auth-secret-never-production-2026",
      NFC_TAP_SECRET: "scps-test-only-nfc-secret-2026", NEXT_PUBLIC_APP_URL: baseURL,
      TRUSTED_ORIGINS: baseURL, BETTER_AUTH_TRUSTED_ORIGINS: baseURL, TRUST_PROXY: "false",
      TELEGRAM_BOT_TOKEN: "", WCP_TELEGRAM_CHAT_ID: "", MICROSOFT_CLIENT_ID: "", MICROSOFT_CLIENT_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Test server exited: ${output}`);
      try {
        const response = await fetch(`${baseURL}/login`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) return { baseURL, database, close };
      } catch { /* Wait for the real development server to accept requests. */ }
      await delay(100);
    }
    throw new Error(`Test server readiness timed out: ${output}`);
  } catch (error) {
    await close();
    throw error;
  }
}
