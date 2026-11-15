import { Suspense } from "react";
import type { Metadata } from "next";
import { getCustomerIdsWithTransactions } from "@/lib/repositories/transactions";
import { PosForm } from "./pos-form";
import { PageLoading } from "@/components/ui/page-loading";
import { requirePageStaffContext } from "@/lib/auth-session";
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
  const session = await requirePageStaffContext();
  const customerIdsWithTransactions = getCustomerIdsWithTransactions();
  const preferences = getUserPreferencesByUserId(session.user.id);

  return (
    <Suspense fallback={<PageLoading />}>
      <PosForm 
        customerIdsWithTransactions={customerIdsWithTransactions}
        userName={session.user.name}
        initialMode={preferences.pos_default_mode}
      />
    </Suspense>
  );
}
