"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TransactionWithStudent } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";

function CopyButton({ txId }: { txId: number }) {
  const [copied, setCopied] = useState(false);

  const copyTransactionId = async () => {
    await navigator.clipboard.writeText(txId.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copyTransactionId}
      className="h-5 w-5 p-0"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

export const columns: ColumnDef<TransactionWithStudent>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div className="flex items-center gap-1 px-4">
          <span className="font-mono text-xs">{tx.id}</span>
          <CopyButton txId={tx.id} />
        </div>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div className="px-4 text-sm">
          {new Date(tx.created_at + "Z").toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Singapore",
          })}
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      return rowA.original.created_at.localeCompare(rowB.original.created_at);
    },
  },
  {
    accessorKey: "student_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Student
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div className="px-4">
          <Link
            href={`/students/${tx.student_id}`}
            className="hover:underline font-medium"
          >
            {tx.student_name}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <Badge
          variant={
            tx.type === "TOPUP"
              ? "default"
              : tx.type === "DEBIT"
              ? "destructive"
              : "secondary"
          }
        >
          {tx.type}
        </Badge>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div>
          {tx.description || "-"}
          {tx.overdraft_component > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              Overdraft: ¥{formatCurrency(tx.overdraft_component)}
            </p>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div className="px-4">
          <span
            className={`font-bold ${
              tx.amount >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {tx.amount >= 0 ? "+" : ""}¥{formatCurrency(Math.abs(tx.amount))}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "staff",
    header: "Staff",
    cell: ({ row }) => {
      const tx = row.original;
      return (
        <div className="text-sm text-muted-foreground">
          {tx.staff || "-"}
        </div>
      );
    },
  },
];

