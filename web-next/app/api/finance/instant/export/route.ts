import { NextResponse } from "next/server";
import { getAuthErrorDetails, requireStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { FinanceError, getFinanceProvisional } from "@/lib/finance";
import { buildFinanceWorkbook } from "@/lib/finance-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let user;
  try {
    ({ user } = await requireStaffContext());
  } catch (error) {
    const details = getAuthErrorDetails(error, "Unable to authorize finance export");
    return NextResponse.json({ error: details.message }, { status: details.status });
  }
  try {
    const months = new URL(request.url).searchParams.getAll("month");
    if (months.length !== 1) throw new FinanceError("Choose a valid month");
    const report = getFinanceProvisional(getDb(), months[0], { id: user.id, name: user.name });
    if (!report) return NextResponse.json({ error: "Set opening balances first" }, { status: 404 });
    const bytes = await buildFinanceWorkbook(report);
    return new Response(bytes as BodyInit, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scps-finance-${report.month}-provisional.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof FinanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Provisional finance export failed", error);
    return NextResponse.json({ error: "Unable to export finance report" }, { status: 500 });
  }
}
