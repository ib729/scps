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

test("CLI refuses an unreadable environment file instead of selecting another ledger", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-path-error-"));
  try {
    fs.mkdirSync(path.join(directory,"lib"));
    fs.copyFileSync(path.join(web,"lib/database-path.cjs"),path.join(directory,"lib/database-path.cjs"));
    fs.symlinkSync(path.join(web,"node_modules"),path.join(directory,"node_modules"));
    fs.writeFileSync(path.join(directory,".env.local"),"DATABASE_PATH=private.db\n",{mode:0});
    const env={...process.env};delete env.DATABASE_PATH;
    assert.throws(()=>execFileSync(process.execPath,[path.join(directory,"lib/database-path.cjs")],{env,stdio:"pipe"}));
    assert.equal(fs.existsSync(path.join(directory,"private.db")),false);
  } finally { fs.chmodSync(path.join(directory,".env.local"),0o600);fs.rmSync(directory,{recursive:true,force:true}); }
});
