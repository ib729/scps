import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAllStudents } from "@/lib/repositories/students";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { PosForm } from "./pos-form";
import { PageLoading } from "@/components/ui/page-loading";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const students = getAllStudents();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <Suspense fallback={<PageLoading />}>
      <PosForm 
        students={students} 
        studentIdsWithTransactions={studentIdsWithTransactions}
        userName={session.user.name}
      />
    </Suspense>
  );
}

