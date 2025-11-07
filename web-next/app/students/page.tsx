import { getAllStudents } from "@/lib/repositories/students";
import { StudentsTable } from "./students-table";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = getAllStudents();

  return (
    <div className="w-full space-y-6">
      <StudentsTable students={students} />
    </div>
  );
}

