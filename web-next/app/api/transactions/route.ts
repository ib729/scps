import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getTransactionsCursorBatch } from "@/lib/repositories/transactions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
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
