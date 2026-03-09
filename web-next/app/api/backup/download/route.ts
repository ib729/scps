import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";

import { getAuthErrorDetails, requireRole } from "@/lib/auth-session";
import { getBackupScriptPath, getProjectRoot } from "@/lib/server-paths";

const execFileAsync = promisify(execFile);

export async function GET() {
    try {
        await requireRole("admin");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `stuco_backup_${timestamp}.tar.gz`;
    const tempFilePath = path.join(os.tmpdir(), `backup_${Date.now()}_${Math.random().toString(36).substring(7)}.tar.gz`);

    try {
        await execFileAsync(getBackupScriptPath(), [tempFilePath], {
            cwd: getProjectRoot(),
        });

        const fileBuffer = await readFile(tempFilePath);

        await unlink(tempFilePath);

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": "application/gzip",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Backup generation failed:", error);

        try {
            if (fs.existsSync(tempFilePath)) {
                await unlink(tempFilePath);
            }
        } catch (cleanupError) {
            console.error("Failed to cleanup temp file:", cleanupError);
        }

        return new NextResponse("Failed to generate backup", { status: 500 });
    }
    } catch (error) {
        const authError = getAuthErrorDetails(error, "Failed to generate backup");
        return new NextResponse(authError.message, { status: authError.status });
    }
}
