import { Suspense } from "react";
import { getAllStudents } from "@/lib/repositories/students";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { PosForm } from "./pos-form";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const students = getAllStudents();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PosForm students={students} studentIdsWithTransactions={studentIdsWithTransactions} />
    </Suspense>
  );
}

