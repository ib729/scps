"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { StudentWithAccount } from "@/lib/models";
import { CreateStudentDialog } from "./create-student-dialog";
import { DeleteStudentDialog } from "./delete-student-dialog";
import { formatCurrency } from "@/lib/currency";

interface StudentsTableProps {
  students: StudentWithAccount[];
  studentIdsWithTransactions: number[];
}

export function StudentsTable({ students, studentIdsWithTransactions }: StudentsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStudents = students.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-4" suppressHydrationWarning>
        <Input
          placeholder="Search students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <CreateStudentDialog />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Overdraft Limit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No students found
                </TableCell>
              </TableRow>
            ) : (
              filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/students/${student.id}`}
                      className="hover:underline"
                    >
                      {student.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        student.balance < 0
                          ? "text-red-600 font-bold"
                          : student.balance <= 50 && studentIdsWithTransactions.includes(student.id)
                          ? "text-orange-600 font-bold"
                          : "font-bold"
                      }
                    >
                      ¥{formatCurrency(student.balance)}
                    </span>
                  </TableCell>
                  <TableCell>¥{formatCurrency(student.max_overdraft_week)}/week</TableCell>
                  <TableCell>
                    {student.balance < 0 ? (
                      <Badge variant="destructive">Overdraft</Badge>
                    ) : student.balance <= 50 && studentIdsWithTransactions.includes(student.id) ? (
                      <Badge variant="secondary">Low Balance</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteStudentDialog
                      studentId={student.id}
                      studentName={student.name}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

