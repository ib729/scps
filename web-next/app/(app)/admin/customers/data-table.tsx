"use client";

import * as React from "react";
import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown } from "@/lib/icons";
import { formatCurrency, LOW_BALANCE_THRESHOLD } from "@/lib/currency";
import { DeleteCustomerDialog } from "./delete-customer-dialog";
import type { CustomerWithAccount } from "@/lib/models";

export type CustomerTableData = CustomerWithAccount & {
  hasTransactions: boolean;
};

interface DataTableProps {
  data: CustomerTableData[];
  addButton?: React.ReactNode;
}

type SortKey = "name" | "balance";

export function DataTable({
  data,
  addButton,
}: DataTableProps) {
  const [searchInput, setSearchInput] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchInput.trim().toLowerCase());
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("asc");

  const filteredRows = React.useMemo(() => {
    const nextRows = deferredSearch
      ? data.filter((customer) =>
          customer.name.toLowerCase().includes(deferredSearch),
        )
      : data;

    return [...nextRows].sort((left, right) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "balance") {
        if (left.balance !== right.balance) {
          return (left.balance - right.balance) * direction;
        }
        return left.name.localeCompare(right.name) * direction;
      }

      const nameComparison = left.name.localeCompare(right.name);
      if (nameComparison !== 0) {
        return nameComparison * direction;
      }
      return (left.balance - right.balance) * direction;
    });
  }, [data, deferredSearch, sortDirection, sortKey]);

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  };

  const renderSortIcon = (key: SortKey) => (
    <ArrowUpDown
      className={`ml-2 h-4 w-4 ${
        sortKey === key ? "text-foreground" : "text-muted-foreground"
      }`}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 flex items-center gap-4 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Input
          placeholder="Filter customers..."
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="flex-1"
        />
        <div className="ml-auto flex items-center gap-2">
          {addButton}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-auto rounded-md border custom-scrollbar"
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => toggleSort("name")}>
                  Customer Name
                  {renderSortIcon("name")}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => toggleSort("balance")}>
                  Balance
                  {renderSortIcon("balance")}
                </Button>
              </TableHead>
              <TableHead>Overdraft Limit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <div className="flex justify-end pr-2">
                  <span>Actions</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length > 0 ? (
              filteredRows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="px-4">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="px-4">
                      <span
                        className={
                          customer.balance < 0
                            ? "font-bold text-red-600"
                            : customer.balance <= LOW_BALANCE_THRESHOLD && customer.hasTransactions
                              ? "font-bold text-red-600"
                              : "font-bold"
                        }
                      >
                        ¥{formatCurrency(customer.balance)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    ¥{formatCurrency(customer.max_overdraft_week)}/week
                  </TableCell>
                  <TableCell>
                    {customer.balance < 0 ? (
                      <Badge variant="destructive">Overdraft</Badge>
                    ) : customer.balance <= LOW_BALANCE_THRESHOLD && customer.hasTransactions ? (
                      <Badge variant="secondary">Low Balance</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end pr-2">
                      <DeleteCustomerDialog
                        customerId={customer.id}
                        customerName={customer.name}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
      <div className="flex items-center justify-end pt-4">
        <div className="text-sm text-muted-foreground">
          {filteredRows.length} customer(s) total
        </div>
      </div>
    </div>
  );
}
