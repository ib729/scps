import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthErrorDetails, requireRole } from "@/lib/auth-session";
import { requireTrustedRequestOrigin } from "@/lib/origin-guard";

async function statIfPresent(file: string) {
  try { return await fs.lstat(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function configuredDirectory() {
  const directory = process.env.SCPS_UPDATE_DIR;
  if (!directory || !path.isAbsolute(directory)) return null;
  const entry = await statIfPresent(path.join(directory, "current"));
  return entry?.isSymbolicLink() ? directory : null;
}

function failure(error: unknown) {
  const response = getAuthErrorDetails(error, "Could not access the update service.");
  if (response.status === 500) console.error("SCPS update endpoint:", error);
  return NextResponse.json({ error: response.message }, { status: response.status });
}

export async function GET(request: Request) {
  try {
    requireTrustedRequestOrigin(request);
    await requireRole("admin");
    const directory = await configuredDirectory();
    if (!directory) return NextResponse.json({ enabled: false, running: false, status: null });
    const running = Boolean(await statIfPresent(path.join(directory, "request")));
    let status = null;
    try {
      status = JSON.parse(await fs.readFile(path.join(directory, "status.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return NextResponse.json({ enabled: true, running, status });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireTrustedRequestOrigin(request);
    const { user } = await requireRole("admin");
    const directory = await configuredDirectory();
    if (!directory) return NextResponse.json({ error: "Background updates are not configured on this host." }, { status: 503 });
    const temporary = path.join(directory, `request-${randomUUID()}`);
    try {
      await fs.writeFile(temporary, `${JSON.stringify({ userId: user.id, requestedAt: new Date().toISOString() })}\n`, { flag: "wx", mode: 0o600 });
      await fs.link(temporary, path.join(directory, "request"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return NextResponse.json({ error: "An update is already queued or running." }, { status: 409 });
    } finally { await fs.rm(temporary, { force: true }); }
    return NextResponse.json({ enabled: true, running: true, status: null }, { status: 202 });
  } catch (error) { return failure(error); }
}
