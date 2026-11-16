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
test("unconfigured discovery preserves old ledgers and prefers existing files without creating any", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scps-discovery-"));
  const packageDir = path.join(root, "web-next");
  try {
    fs.mkdirSync(path.join(packageDir, "lib"), { recursive: true });
    fs.copyFileSync(path.join(web, "lib/database-path.ts"), path.join(packageDir, "lib/database-path.ts"));
    fs.copyFileSync(path.join(web, "package.json"), path.join(packageDir, "package.json"));
    fs.symlinkSync(path.join(web, "node_modules"), path.join(packageDir, "node_modules"));
    const files = [path.join(packageDir, "stuco.db"), path.join(root, "stuco.db"), path.join(packageDir, "scps.db"), path.join(root, "scps.db")];
    const run = (cwd: string, value?: string) => {
      const env = { ...process.env }; delete env.DATABASE_PATH;
      if (value !== undefined) env.DATABASE_PATH = value;
      return execFileSync(process.execPath, ["--import", tsx, path.join(packageDir, "lib/database-path.ts")], { cwd, env, encoding: "utf8" }).trim();
    };
    for (const cwd of [root, packageDir]) for (const value of [undefined, "", "/absolute/path/to/stuco.db", "/absolute/path/to/scps.db"]) assert.equal(run(cwd, value), files[3]);
    assert.ok(files.every(file => !fs.existsSync(file)));
    for (const file of [...files].reverse()) {
      fs.writeFileSync(file, "");
      for (const cwd of [root, packageDir]) assert.equal(run(cwd), file);
    }
    for (const value of [files[1], "../stuco.db"]) for (const cwd of [root, packageDir]) assert.equal(run(cwd, value), files[1]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
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
