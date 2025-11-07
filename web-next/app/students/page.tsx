import { getAllStudents } from "@/lib/repositories/students";
import { StudentsTable } from "./students-table";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = getAllStudents();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground mt-2">
            Manage student accounts and balances
          </p>
        </div>
      </div>

      <StudentsTable students={students} />
    </div>
  );
}

