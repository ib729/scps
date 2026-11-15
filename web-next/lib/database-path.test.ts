import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const web = path.resolve(import.meta.dirname, "..");
test("configured paths target the same absolute file from either working directory without creating it", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scps-path-"));
  try {
    const absolute = path.join(temporary, "with space", "ledger.db");
    for (const configured of [absolute, path.relative(web, absolute)]) {
      for (const cwd of [web, path.dirname(web)]) {
        const result = execFileSync(process.execPath, [path.join(web, "lib/database-path.cjs")], { cwd, env: { ...process.env, DATABASE_PATH: configured }, encoding: "utf8" }).trim();
        assert.equal(result, absolute);
        assert.equal(fs.existsSync(absolute), false);
      }
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
