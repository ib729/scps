import { Suspense } from "react";
import { getAllStudents } from "@/lib/repositories/students";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const students = getAllStudents();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TopupForm students={students} studentIdsWithTransactions={studentIdsWithTransactions} />
    </Suspense>
  );
}

