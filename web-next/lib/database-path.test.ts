import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const tsx = createRequire(import.meta.url).resolve("tsx");

const web = path.resolve(import.meta.dirname, "..");
test("configured paths target the same absolute file from either working directory without creating it", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scps-path-"));
  try {
    const absolute = path.join(temporary, "with space", "ledger.db");
    for (const configured of [absolute, path.relative(web, absolute)]) {
      for (const cwd of [web, path.dirname(web)]) {
        const result = execFileSync(process.execPath, ["--import", tsx, path.join(web, "lib/database-path.ts")], { cwd, env: { ...process.env, DATABASE_PATH: configured }, encoding: "utf8" }).trim();
        assert.equal(result, absolute);
        assert.equal(fs.existsSync(absolute), false);
      }
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("CLI refuses an unreadable environment file instead of selecting another ledger", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-path-error-"));
  try {
    fs.mkdirSync(path.join(directory,"lib"));
    fs.copyFileSync(path.join(web,"lib/database-path.ts"),path.join(directory,"lib/database-path.ts"));
    fs.copyFileSync(path.join(web,"package.json"),path.join(directory,"package.json"));
    fs.symlinkSync(path.join(web,"node_modules"),path.join(directory,"node_modules"));
    fs.writeFileSync(path.join(directory,".env.local"),"DATABASE_PATH=private.db\n",{mode:0});
    const env={...process.env};delete env.DATABASE_PATH;
    assert.throws(
      () => execFileSync(process.execPath, ["--import", "tsx", path.join(directory, "lib/database-path.ts")], { cwd: directory, env, stdio: "pipe" }),
      (error: unknown) => error instanceof Error && "stderr" in error && /EACCES/.test(String(error.stderr)),
    );
    assert.equal(fs.existsSync(path.join(directory,"private.db")),false);
  } finally { fs.chmodSync(path.join(directory,".env.local"),0o600);fs.rmSync(directory,{recursive:true,force:true}); }
});
