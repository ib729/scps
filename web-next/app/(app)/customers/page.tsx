import { getAllStudents } from "@/lib/repositories/students";
import { getStudentIdsWithTransactions } from "@/lib/repositories/transactions";
import { StudentsTable } from "./students-table";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = getAllStudents();
  const studentIdsWithTransactions = getStudentIdsWithTransactions();

  return (
    <div className="w-full space-y-6">
      <StudentsTable students={students} studentIdsWithTransactions={studentIdsWithTransactions} />
    </div>
  );
}
