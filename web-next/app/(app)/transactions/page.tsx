import { getAllTransactions } from "@/lib/repositories/transactions";
import { TransactionsTable } from "./transactions-table";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = getAllTransactions();

  return (
    <div className="w-full space-y-6">
      <TransactionsTable transactions={transactions} />
    </div>
  );
}

