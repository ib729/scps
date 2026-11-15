import { NextRequest, NextResponse } from "next/server";

import { requireStaffContext, getAuthErrorDetails } from "@/lib/auth-session";
import { getTransactionsCursorBatch } from "@/lib/repositories/transactions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireStaffContext();
  } catch (error) {
    const details = getAuthErrorDetails(error, "Failed to authorize request");
    return NextResponse.json({ success: false, error: details.message }, { status: details.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const search = searchParams.get("search")?.trim() || undefined;
  const type = searchParams.get("type")?.trim() || undefined;
  const cursorCreatedAt = searchParams.get("cursorCreatedAt");
  const cursorId = searchParams.get("cursorId");
  const parsedCursorId = cursorId ? Number.parseInt(cursorId, 10) : NaN;

  const data = getTransactionsCursorBatch({
    limit: Number.isFinite(limit) ? limit : 100,
    search,
    type,
    cursor:
      cursorCreatedAt && Number.isFinite(parsedCursorId)
        ? {
            createdAt: cursorCreatedAt,
            id: parsedCursorId,
          }
        : null,
  });

  return NextResponse.json({
    success: true,
    data,
  });
}
