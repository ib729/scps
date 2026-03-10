"use client";

import { useState, useEffect, useMemo } from "react";
import type { StudentWithAccount } from "@/lib/models";
import { CreateStudentDialog } from "./create-student-dialog";
import { DataTable } from "./data-table";
import type { StudentTableData } from "./columns";

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
  const tableData = useMemo<StudentTableData[]>(() => {
    const studentsWithTransactions = new Set(studentIdsWithTransactions);

    return students.map((student) => ({
      ...student,
      hasTransactions: studentsWithTransactions.has(student.id),
    }));
  }, [studentIdsWithTransactions, students]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DataTable data={tableData} addButton={mounted ? <CreateStudentDialog /> : null} />
    </div>
  );
}
