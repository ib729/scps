"use client";

import { useState, useEffect, useMemo } from "react";
import type { CustomerWithAccount } from "@/lib/models";
import { CreateCustomerDialog } from "./create-customer-dialog";
import { DataTable } from "./data-table";
import type { CustomerTableData } from "./data-table";

interface CustomersTableProps {
  customers: CustomerWithAccount[];
  customerIdsWithTransactions: number[];
}

export function CustomersTable({ customers, customerIdsWithTransactions }: CustomersTableProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Transform customers data to include hasTransactions flag
  const tableData = useMemo<CustomerTableData[]>(() => {
    const customersWithTransactions = new Set(customerIdsWithTransactions);

    return customers.map((customer) => ({
      ...customer,
      hasTransactions: customersWithTransactions.has(customer.id),
    }));
  }, [customerIdsWithTransactions, customers]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DataTable data={tableData} addButton={mounted ? <CreateCustomerDialog /> : null} />
    </div>
  );
}
