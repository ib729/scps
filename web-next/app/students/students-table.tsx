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

interface StudentsTableProps {
  students: StudentWithAccount[];
}

export function StudentsTable({ students }: StudentsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStudents = students.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input
          placeholder="Search students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
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
                          : student.balance < 10
                          ? "text-orange-600 font-bold"
                          : "font-bold"
                      }
                    >
                      ¥{student.balance}
                    </span>
                  </TableCell>
                  <TableCell>¥{student.max_overdraft_week}/week</TableCell>
                  <TableCell>
                    {student.balance < 0 ? (
                      <Badge variant="destructive">Overdraft</Badge>
                    ) : student.balance < 10 ? (
                      <Badge variant="secondary">Low Balance</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/students/${student.id}`}>View</Link>
                    </Button>
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

