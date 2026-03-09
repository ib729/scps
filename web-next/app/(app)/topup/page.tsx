import { Suspense } from "react";
import type { Metadata } from "next";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { TopupForm } from "./topup-form";
import { PageLoading } from "@/components/ui/page-loading";
import { requirePageAuthContext } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Top-up",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const session = await requirePageAuthContext();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <Suspense fallback={<PageLoading />}>
      <TopupForm 
        studentIdsWithTransactions={studentIdsWithTransactions}
        userName={session.user.name}
      />
    </Suspense>
  );
}
