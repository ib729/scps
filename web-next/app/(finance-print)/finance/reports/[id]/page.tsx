import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { getFinanceReport } from "@/lib/finance";
import { FinanceStatement } from "./finance-statement";

export const metadata: Metadata = { title: "Finance statement", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FinanceReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageStaffContext();
  const { id } = await params;
  const reportId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(reportId)) notFound();
  const report = getFinanceReport(getDb(), reportId);
  if (!report) notFound();
  return <FinanceStatement snapshot={report.snapshot} stale={report.stale} staleReason={report.staleReason} />;
}
