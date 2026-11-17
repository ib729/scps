import { NextResponse } from "next/server";
import { getAuthErrorDetails, requireStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { getFinanceMonthBounds, getFinanceReport } from "@/lib/finance";
import { buildFinanceWorkbook } from "@/lib/finance-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffContext();
  } catch (error) {
    const details = getAuthErrorDetails(error, "Unable to authorize finance export");
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
  const { id } = await params;
  const reportId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(reportId)) return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
  try {
    const report = getFinanceReport(getDb(), reportId);
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const { snapshot } = report;
    getFinanceMonthBounds(snapshot.month);
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) throw new Error("Invalid saved report revision");
    const bytes = await buildFinanceWorkbook(snapshot);
    return new Response(bytes as BodyInit, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scps-finance-${snapshot.month}-r${snapshot.revision}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Finance export failed", error);
    return NextResponse.json({ error: "Unable to export finance statement" }, { status: 500 });
  }
}
