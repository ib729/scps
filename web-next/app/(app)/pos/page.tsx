import { Suspense } from "react";
import type { Metadata } from "next";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { PosForm } from "./pos-form";
import { PageLoading } from "@/components/ui/page-loading";
import { requirePageAuthContext } from "@/lib/auth-session";
import { getUserPreferencesByUserId } from "@/lib/repositories/user-preferences";

export const metadata: Metadata = {
  title: "Point of Sale",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await requirePageAuthContext();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();
  const preferences = getUserPreferencesByUserId(session.user.id);

  return (
    <Suspense fallback={<PageLoading />}>
      <PosForm 
        studentIdsWithTransactions={studentIdsWithTransactions}
        userName={session.user.name}
        initialMode={preferences.pos_default_mode}
      />
    </Suspense>
  );
}
