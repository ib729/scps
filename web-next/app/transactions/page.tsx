import { getAllTransactions } from "@/lib/repositories/transactions";
import { TransactionsTable } from "./transactions-table";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = getAllTransactions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-muted-foreground mt-2">
          View all transaction history
        </p>
      </div>

      <TransactionsTable transactions={transactions} />
    </div>
  );
}

