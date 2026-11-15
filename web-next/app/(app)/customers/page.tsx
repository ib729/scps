import { requirePageStaffContext } from "@/lib/auth-session";
import { getAllCustomers } from "@/lib/repositories/customers";
import { getCustomerIdsWithTransactions } from "@/lib/repositories/transactions";
import { CustomersTable } from "./customers-table";
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CustomersTable customers={customers} customerIdsWithTransactions={customerIdsWithTransactions} />
    </div>
  );
}
