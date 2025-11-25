import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { exec } from "child_process";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

export async function GET() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `stuco_backup_${timestamp}.tar.gz`;
    const tempFilePath = path.join(os.tmpdir(), `backup_${Date.now()}_${Math.random().toString(36).substring(7)}.tar.gz`);

    // Path to the backup script - assuming it's in the scripts directory at the project root
    // We need to resolve the project root. Since we are in app/api/backup/download, 
    // project root is ../../../../.. from here? No, better to use process.cwd()
    const scriptPath = path.join(process.cwd(), "..", "scripts", "web_backup.sh");

    try {
        // Execute the backup script
        // We pass the output file path as an argument
        // We set CWD to the project root (parent of web-next) so it can find the db
        const projectRoot = path.join(process.cwd(), "..");

        await execAsync(`"${scriptPath}" "${tempFilePath}"`, { cwd: projectRoot });

        // Read the file content
        const fileBuffer = await readFileAsync(tempFilePath);

        // Delete the temporary file
        await unlinkAsync(tempFilePath);

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": "application/gzip",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Backup generation failed:", error);

        // Try to clean up temp file if it exists
        try {
            if (fs.existsSync(tempFilePath)) {
                await unlinkAsync(tempFilePath);
            }
        } catch (cleanupError) {
            console.error("Failed to cleanup temp file:", cleanupError);
        }

        return new NextResponse("Failed to generate backup", { status: 500 });
    }
}
