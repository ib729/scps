"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudentWithAccount } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";
import { DeleteStudentDialog } from "./delete-student-dialog";

export type StudentTableData = StudentWithAccount & {
  hasTransactions: boolean;
};

export const columns: ColumnDef<StudentTableData>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Student Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const student = row.original;
      return (
        <div className="px-4">
          <Link
            href={`/students/${student.id}`}
            className="font-medium hover:underline"
          >
            {student.name}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: "balance",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Balance
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const student = row.original;
      const balance = student.balance;
      const hasTransactions = student.hasTransactions;

      return (
        <div className="px-4">
          <span
            className={
              balance < 0
                ? "text-red-600 font-bold"
                : balance <= 50 && hasTransactions
                ? "text-orange-600 font-bold"
                : "font-bold"
            }
          >
            ¥{formatCurrency(balance)}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "max_overdraft_week",
    header: "Overdraft Limit",
    cell: ({ row }) => {
      return `¥${formatCurrency(row.getValue("max_overdraft_week"))}/week`;
    },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const student = row.original;
      const balance = student.balance;
      const hasTransactions = student.hasTransactions;

      if (balance < 0) {
        return <Badge variant="destructive">Overdraft</Badge>;
      } else if (balance <= 50 && hasTransactions) {
        return <Badge variant="secondary">Low Balance</Badge>;
      } else {
        return <Badge variant="default">Active</Badge>;
      }
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      const student = row.original;

      return (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/students/${student.id}`}>View</Link>
          </Button>
          <DeleteStudentDialog
            studentId={student.id}
            studentName={student.name}
          />
        </div>
      );
    },
  },
];

