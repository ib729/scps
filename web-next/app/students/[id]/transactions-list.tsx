"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import type { Transaction } from "@/lib/models";

interface TransactionsListProps {
  transactions: Transaction[];
}

export function TransactionsList({ transactions }: TransactionsListProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setCopiedId(txId);
    setTimeout(() => setCopiedId(null), 2000);
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
            <div className="flex items-center gap-2 flex-wrap">
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
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                ID: <span className="font-mono">{tx.id}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyTransactionId(tx.id)}
                className="h-4 w-4 p-0"
              >
                {copiedId === tx.id ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
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

