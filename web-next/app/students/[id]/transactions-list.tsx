"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/models";
import { deleteTransactionAction } from "@/app/actions/transactions";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TransactionsListProps {
  transactions: Transaction[];
}

export function TransactionsList({ transactions }: TransactionsListProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);

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

  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No transactions yet</p>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center justify-between border rounded-lg p-3"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
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
              <p className="font-medium">{tx.description}</p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(tx.created_at).toLocaleString()}
            </p>
            {tx.staff && (
              <p className="text-xs text-muted-foreground">Staff: {tx.staff}</p>
            )}
            {tx.overdraft_component > 0 && (
              <p className="text-xs text-orange-600">
                Overdraft used: ¥{tx.overdraft_component}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p
              className={`text-lg font-bold ${
                tx.amount >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {tx.amount >= 0 ? "+" : ""}¥{tx.amount}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(tx.id)}
              disabled={loading === tx.id}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

