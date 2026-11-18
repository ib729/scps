import { requirePageStaffContext } from "@/lib/auth-session";
import type { Metadata } from "next";

import { getTransactionsCursorBatch } from "@/lib/repositories/transactions";
import { TransactionsClient } from "./transactions-client";

export const metadata: Metadata = {
  title: "Transactions",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  await requirePageStaffContext();
  const initialBatch = getTransactionsCursorBatch({
    limit: 150,
    cursor: null,
  });

  return (
    <div data-workspace-frame className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TransactionsClient
        initialData={initialBatch.items}
        initialCursor={initialBatch.nextCursor}
        initialHasMore={initialBatch.hasMore}
      />
    </div>
  );
}
