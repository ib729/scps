"use client";

import { Badge } from "@/components/ui/badge";
import type { Transaction } from "@/lib/models";

interface TransactionsListProps {
  transactions: Transaction[];
}

export function TransactionsList({ transactions }: TransactionsListProps) {
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
              {new Date(tx.created_at).toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
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
          <p
            className={`text-lg font-bold ${
              tx.amount >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {tx.amount >= 0 ? "+" : ""}¥{tx.amount}
          </p>
        </div>
      ))}
    </div>
  );
}

