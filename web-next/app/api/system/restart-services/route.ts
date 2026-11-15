/**
 * System Services Restart API
 * 
 * Allows administrators to restart the NFC tap broadcaster systemd services.
 * Requires only the tool's fixed native sudo commands, never arbitrary Node sudo.
 */

import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { getAuthErrorDetails, requireRole } from "@/lib/auth-session";
import { requireTrustedRequestOrigin } from "@/lib/origin-guard";
import { getFixReadersScriptPath, getProjectRoot } from "@/lib/server-paths";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    requireTrustedRequestOrigin(request);
    const session = await requireRole("admin");

    console.log(`[System] Restarting NFC services - Requested by: ${session.user.email}`);

    await execFileAsync(process.execPath, ["--import", "tsx", getFixReadersScriptPath()], {
      cwd: path.join(getProjectRoot(), "web-next"), timeout: 60000,
    });

    console.log("[System] Successfully restarted NFC services");

    return NextResponse.json({
      success: true,
      message: "NFC services restarted successfully",
    });
  } catch (error) {
    console.error("[System] Error processing restart request:", error);

    const authError = getAuthErrorDetails(error, "Internal server error");

    return NextResponse.json(
      { success: false, error: authError.message },
      { status: authError.status }
    );
  }
}

export async function GET(request: Request) {
  try {
    requireTrustedRequestOrigin(request);
    await requireRole("admin");
    return NextResponse.json({
      service: "system-services-manager",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const authError = getAuthErrorDetails(error, "Unauthorized");
    return NextResponse.json(
      { success: false, error: authError.message },
      { status: authError.status }
    );
  }
}
