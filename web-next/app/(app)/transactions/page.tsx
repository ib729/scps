import type { Metadata } from "next";

import { getTransactionsBatch } from "@/lib/repositories/transactions";
import { DataTable } from "./data-table";
import { columns } from "./columns";

export const metadata: Metadata = {
  title: "Transactions",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const initialBatch = getTransactionsBatch({
    offset: 0,
    limit: 100,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DataTable
        columns={columns}
        initialData={initialBatch.items}
        initialOffset={initialBatch.nextOffset}
        initialHasMore={initialBatch.hasMore}
        totalCount={initialBatch.total}
      />
    </div>
  );
}
