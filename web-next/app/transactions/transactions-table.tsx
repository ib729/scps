"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TransactionWithStudent } from "@/lib/models";
import { deleteTransactionAction } from "@/app/actions/transactions";

interface TransactionsTableProps {
  transactions: TransactionWithStudent[];
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState<number | null>(null);
  const router = useRouter();

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this transaction? The balance will be adjusted accordingly."
      )
    ) {
      return;
    }
    setLoading(id);
    await deleteTransactionAction(id);
    router.refresh();
    setLoading(null);
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
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                    {new Date(tx.created_at).toLocaleString()}
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
                      {tx.description}
                      {tx.overdraft_component > 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          Overdraft: ¥{tx.overdraft_component}
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
                      {tx.amount >= 0 ? "+" : ""}¥{tx.amount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tx.staff || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tx.id)}
                      disabled={loading === tx.id}
                    >
                      Delete
                    </Button>
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

