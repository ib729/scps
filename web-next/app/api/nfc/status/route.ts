import fs from "node:fs";
import { spawnSync } from "node:child_process";

import { NextRequest, NextResponse } from "next/server";

import {
  getAuthErrorDetails,
  requireAuthContext,
} from "@/lib/auth-session";
import { parseNfcReader, type NFCReader } from "@/lib/pos-preferences";

const READER_CONFIG: Record<
  NFCReader,
  { devicePath: string; serviceName: string; label: string }
> = {
  "reader-1": {
    devicePath: "/dev/ttyUSB0",
    serviceName: "tap-broadcaster.service",
    label: "Reader 1",
  },
  "reader-2": {
    devicePath: "/dev/ttyUSB1",
    serviceName: "tap-broadcaster-reader2.service",
    label: "Reader 2",
  },
};

function getServiceStatus(serviceName: string) {
  if (process.platform !== "linux") {
    return {
      available: false,
      status: "unsupported",
      active: false,
    };
  }

  const result = spawnSync("systemctl", ["is-active", serviceName], {
    encoding: "utf8",
    timeout: 1500,
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    return {
      available: false,
      status: error.code ?? "error",
      active: false,
    };
  }

  const status =
    result.stdout.trim() ||
    result.stderr.trim() ||
    (result.status === 0 ? "active" : "unknown");

  return {
    available: true,
    status,
    active: status === "active",
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuthContext();

    const requestedReader = parseNfcReader(
      request.nextUrl.searchParams.get("reader"),
    );
    const config = READER_CONFIG[requestedReader];
    const devicePresent = fs.existsSync(config.devicePath);
    const service = getServiceStatus(config.serviceName);
    const connected = devicePresent && (!service.available || service.active);

    const message = connected
      ? `${config.label} connected`
      : !devicePresent
        ? `${config.label} not detected`
        : service.available
          ? `${config.label} service ${service.status}`
          : `${config.label} unavailable`;

    return NextResponse.json(
      {
        success: true,
        data: {
          reader: requestedReader,
          connected,
          message,
          devicePath: config.devicePath,
          devicePresent,
          serviceName: config.serviceName,
          serviceStatus: service.status,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const authError = getAuthErrorDetails(error, "Unauthorized");
    return NextResponse.json(
      { success: false, error: authError.message },
      {
        status: authError.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
