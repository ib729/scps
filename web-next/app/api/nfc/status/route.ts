import { isReaderConnected } from "@/lib/nfc-readers";

import { NextRequest, NextResponse } from "next/server";

import {
  getAuthErrorDetails,
  requireStaffContext,
} from "@/lib/auth-session";
import { parseNfcReader } from "@/lib/pos-preferences";


export async function GET(request: NextRequest) {
  try {
    await requireStaffContext();

    const requestedReader = parseNfcReader(
      request.nextUrl.searchParams.get("reader"),
    );
    const connected = isReaderConnected(requestedReader);
    const label = requestedReader === "reader-1" ? "Reader 1" : "Reader 2";
    const message = connected
      ? `${label} broadcaster connected; hardware health unknown`
      : `${label} broadcaster disconnected`;

    return NextResponse.json(
      {
        success: true,
        data: {
          reader: requestedReader,
          connected,
          message,
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
