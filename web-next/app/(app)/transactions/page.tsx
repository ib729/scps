import Link from "next/link";

import { getTransactionsPage } from "@/lib/repositories/transactions";
import { Button } from "@/components/ui/button";
import { DataTable } from "./data-table";
import { columns } from "./columns";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pageValue = resolvedSearchParams?.page;
  const page = Array.isArray(pageValue)
    ? Number.parseInt(pageValue[0] || "1", 10)
    : Number.parseInt(pageValue || "1", 10);
  const transactions = getTransactionsPage({
    page: Number.isFinite(page) ? page : 1,
    pageSize: 100,
  });

  return (
    <div className="w-full space-y-6">
      <DataTable
        columns={columns}
        data={transactions.items}
        totalCount={transactions.total}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {transactions.page} of {transactions.totalPages}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" disabled={transactions.page <= 1}>
            <Link href={`/transactions?page=${Math.max(1, transactions.page - 1)}`}>
              Previous
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            disabled={transactions.page >= transactions.totalPages}
          >
            <Link
              href={`/transactions?page=${Math.min(
                transactions.totalPages,
                transactions.page + 1,
              )}`}
            >
              Next
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
