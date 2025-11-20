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

    // Execute the fix-readers.sh script instead of just restarting services
    // This script handles driver reset (modprobe) and service restarts
    const command = "sudo /home/qiss/scps/scripts/fix-readers.sh";
    
    // Increase timeout for this command as it takes ~10-15 seconds
    const { stdout, stderr } = await execAsync(command, { timeout: 20000 });

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

