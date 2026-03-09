import { Suspense } from "react";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { PosForm } from "./pos-form";
import { PageLoading } from "@/components/ui/page-loading";
import { requirePageAuthContext } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await requirePageAuthContext();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <Suspense fallback={<PageLoading />}>
      <PosForm 
        studentIdsWithTransactions={studentIdsWithTransactions}
        userName={session.user.name}
      />
    </Suspense>
  );
}
