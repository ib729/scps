import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { getSchoolSettings, saveSchoolSettings } from "./school-settings";

const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("school branding persists without disturbing other metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "scps-school-settings-"));
  const db = new Database(join(dir, "test.sqlite"));
  try {
    db.exec("CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO app_meta VALUES ('currency_scale', '100')");
    const year = new Date().getFullYear();
    assert.deepEqual(getSchoolSettings(db), { schoolYear: `${year}-${year + 1}`, logo: null });
    saveSchoolSettings(db, { schoolYear: " 2027-2028 ", logo });
    assert.deepEqual(getSchoolSettings(db), { schoolYear: "2027-2028", logo });
    assert.deepEqual(db.prepare("SELECT value FROM app_meta WHERE key = 'currency_scale'").get(), { value: "100" });

    for (const input of [
      { schoolYear: " ", logo },
      { schoolYear: "x".repeat(41), logo },
      { schoolYear: "2028-2029", logo: "data:image/svg+xml;base64,PHN2Zz4=" },
      { schoolYear: "2028-2029", logo: "data:image/png;base64,SGVsbG8=" },
      { schoolYear: "2028-2029", logo: "data:image/png;base64,!!!!" },
      { schoolYear: "2028-2029", logo: `data:image/png;base64,${Buffer.alloc(512 * 1024 + 1).toString("base64")}` },
    ]) {
      assert.throws(() => saveSchoolSettings(db, input));
      assert.deepEqual(getSchoolSettings(db), { schoolYear: "2027-2028", logo });
    }

    saveSchoolSettings(db, { schoolYear: "2029-2030", logo: null });
    assert.deepEqual(getSchoolSettings(db), { schoolYear: "2029-2030", logo: null });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
