import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { FinanceError, getFinanceProvisional } from "@/lib/finance";
import { FinanceStatement } from "../reports/[id]/finance-statement";

export const metadata: Metadata = { title: "Provisional finance report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FinanceInstantPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const { user } = await requirePageStaffContext();
  const { month } = await searchParams;
  if (typeof month !== "string") notFound();
  try {
    const report = getFinanceProvisional(getDb(), month, { id: user.id, name: user.name });
    if (!report) notFound();
    return <FinanceStatement snapshot={report} stale={false} staleReason={null} />;
  } catch (error) {
    if (error instanceof FinanceError) return <main><h1>Unable to generate provisional report</h1><p role="alert">{error.message}</p></main>;
    throw error;
  }
}
