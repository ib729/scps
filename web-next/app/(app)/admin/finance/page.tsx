import type { Metadata } from "next";
import Link from "next/link";
import { requirePageStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { FinanceError, getFinanceMonthBounds, getFinancePageData } from "@/lib/finance";
import { FinanceClient } from "./finance-client";

export const metadata: Metadata = { title: "Finance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await requirePageStaffContext();
  const currentMonth = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
  const requested = (await searchParams).month;
  const month = requested === undefined ? currentMonth : requested;
  try {
    if (typeof month !== "string") throw new FinanceError("Choose a valid month");
    getFinanceMonthBounds(month);
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error;
    return <div className="space-y-4"><h1 className="text-2xl font-semibold">Finance</h1><p role="alert">Choose a valid month from 2000 onward.</p><Link className="underline" href="/admin/finance">Go to the current month</Link></div>;
  }
  return <FinanceClient data={getFinancePageData(getDb(), month)} />;
}
