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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TransactionWithStudent } from "@/lib/models";
import { formatCurrency } from "@/lib/currency";

interface TransactionsTableProps {
  transactions: TransactionWithStudent[];
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setCopiedId(txId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.student_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input
          placeholder="Search by student name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="TOPUP">Top-up</SelectItem>
            <SelectItem value="DEBIT">Debit</SelectItem>
            <SelectItem value="ADJUST">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Staff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{tx.id}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyTransactionId(tx.id)}
                        className="h-5 w-5 p-0"
                      >
                        {copiedId === tx.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(tx.created_at).toLocaleString("en-US", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Singapore",
                    })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/${tx.student_id}`}
                      className="hover:underline font-medium"
                    >
                      {tx.student_name}
                    </Link>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <div>
                      {tx.description || "-"}
                      {tx.overdraft_component > 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          Overdraft: ¥{formatCurrency(tx.overdraft_component)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-bold ${
                        tx.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount >= 0 ? "+" : ""}¥{formatCurrency(Math.abs(tx.amount))}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tx.staff || "-"}
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

