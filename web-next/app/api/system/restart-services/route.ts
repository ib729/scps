/**
 * System Services Restart API
 * 
 * Allows authenticated users to restart the NFC tap broadcaster systemd services.
 * Requires passwordless sudo to be configured for the web UI user.
 */

import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getAuthErrorDetails, requireRole } from "@/lib/auth-session";
import { getFixReadersScriptPath } from "@/lib/server-paths";

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    const session = await requireRole("admin");

    console.log(`[System] Restarting NFC services - Requested by: ${session.user.email}`);

    await execFileAsync("sudo", [getFixReadersScriptPath()], { timeout: 20000 });

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

export async function GET() {
  try {
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
