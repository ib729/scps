"use client";

import { useState, useEffect } from "react";
import type { StudentWithAccount } from "@/lib/models";
import { CreateStudentDialog } from "./create-student-dialog";
import { DataTable } from "./data-table";
import { columns, type StudentTableData } from "./columns";

interface StudentsTableProps {
  students: StudentWithAccount[];
  studentIdsWithTransactions: number[];
}

export function StudentsTable({ students, studentIdsWithTransactions }: StudentsTableProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Transform students data to include hasTransactions flag
  const tableData: StudentTableData[] = students.map((student) => ({
    ...student,
    hasTransactions: studentIdsWithTransactions.includes(student.id),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DataTable columns={columns} data={tableData} addButton={mounted ? <CreateStudentDialog /> : null} />
    </div>
  );
}
