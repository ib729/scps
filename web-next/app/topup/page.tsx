import { getAllStudents } from "@/lib/repositories/students";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const students = getAllStudents();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return <TopupForm students={students} studentIdsWithTransactions={studentIdsWithTransactions} />;
}

