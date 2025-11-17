/**
 * System Services Restart API
 * 
 * Allows authenticated users to restart the NFC tap broadcaster systemd services.
 * Requires passwordless sudo to be configured for the web UI user.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log(`[System] Restarting NFC services - Requested by: ${session.user.email}`);

    // Execute systemctl restart command
    const command = "sudo systemctl restart tap-broadcaster.service tap-broadcaster-reader2.service";
    
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes("Warning")) {
      console.error("[System] Error restarting services:", stderr);
      return NextResponse.json(
        { success: false, error: "Failed to restart services", details: stderr },
        { status: 500 }
      );
    }

    console.log("[System] Successfully restarted NFC services");

    return NextResponse.json({
      success: true,
      message: "NFC services restarted successfully",
      output: stdout,
    });
  } catch (error) {
    console.error("[System] Error processing restart request:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return NextResponse.json(
      { success: false, error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: "system-services-manager",
    timestamp: new Date().toISOString(),
  });
}

