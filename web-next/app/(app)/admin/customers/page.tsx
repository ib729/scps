import { requirePageStaffContext } from "@/lib/auth-session";
import { getAllCustomers } from "@/lib/repositories/customers";
import { getCustomerIdsWithTransactions } from "@/lib/repositories/transactions";
import { CustomersTable } from "./customers-table";
import { Card } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requirePageStaffContext();
  const customers = getAllCustomers();
  const customerIdsWithTransactions = getCustomerIdsWithTransactions();

  return (
    <Card data-workspace-frame className="min-h-0 min-w-0 flex-1 overflow-hidden p-4 sm:p-6">
      <CustomersTable customers={customers} customerIdsWithTransactions={customerIdsWithTransactions} />
    </Card>
  );
}
