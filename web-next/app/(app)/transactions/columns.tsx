"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Copy, Check, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function TransactionDetailsDialog({ tx }: { tx: TransactionWithStudent }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 text-blue-500 hover:text-blue-700 font-medium">
          Read more
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Complete information for transaction #{tx.id}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Transaction ID</p>
              <p className="text-sm font-mono">{tx.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p className="text-sm">
                {new Date(tx.created_at + "Z").toLocaleString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Singapore",
                })}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Student</p>
              <Link
                href={`/students/${tx.student_id}`}
                className="text-sm hover:underline font-medium text-primary"
              >
                {tx.student_name}
              </Link>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Type</p>
              <div className="mt-1">
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
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Amount</p>
              <p
                className={`text-sm font-bold ${
                  tx.amount >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {tx.amount >= 0 ? "+" : ""}¥{formatCurrency(Math.abs(tx.amount))}
              </p>
            </div>
            {tx.overdraft_component > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdraft Component</p>
                <p className="text-sm font-bold text-orange-600">
                  ¥{formatCurrency(tx.overdraft_component)}
                </p>
              </div>
            )}
            {tx.staff && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Staff</p>
                <p className="text-sm">{tx.staff}</p>
              </div>
            )}
            {tx.card_uid && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Card UID</p>
                <p className="text-sm font-mono">{tx.card_uid}</p>
              </div>
            )}
          </div>
          {tx.description && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Description</p>
              <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap break-words">
                {tx.description}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      const description = tx.description || "";
      const maxLength = 50;
      const isTruncated = description.length > maxLength;
      
      return (
        <div className="max-w-xs">
          {description ? (
            <>
              <p className="text-sm break-words">
                {isTruncated ? description.slice(0, maxLength) + "..." : description}
              </p>
              {isTruncated && (
                <TransactionDetailsDialog tx={tx} />
              )}
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
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

