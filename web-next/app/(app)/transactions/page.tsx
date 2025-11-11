import { getAllTransactions } from "@/lib/repositories/transactions";
import { DataTable } from "./data-table";
import { columns } from "./columns";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = getAllTransactions();

  return (
    <div className="w-full space-y-6">
      <DataTable columns={columns} data={transactions} />
    </div>
  );
}

