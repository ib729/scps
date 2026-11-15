import { requirePageStaffContext } from "@/lib/auth-session";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCustomerById } from "@/lib/repositories/customers";
import { getTransactionsByCustomerId } from "@/lib/repositories/transactions";
import { getCardsByCustomerId } from "@/lib/repositories/cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UpdateCustomerForm } from "./update-customer-form";
import { UpdateAccountForm } from "./update-account-form";
import { AddCardDialogWrapper } from "./add-card-dialog-wrapper";
import { TransactionsList } from "./transactions-list";
import { CardsList } from "./cards-list";
import { formatCurrency, LOW_BALANCE_THRESHOLD } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Customer Details",
  robots: {
    index: false,
    follow: false,
  },
};

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  await requirePageStaffContext();
  const { id } = await params;
  const customerId = parseInt(id, 10);

  if (isNaN(customerId)) {
    notFound();
  }

  const customer = getCustomerById(customerId);
  if (!customer) {
    notFound();
  }

  const transactions = getTransactionsByCustomerId(customerId);
  const cards = getCardsByCustomerId(customerId);
  const hasTransactions = transactions.length > 0;

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{customer.name}</h2>
          <p className="text-muted-foreground mt-1">Customer ID: {customer.id}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/customers">Back to Customers</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-4xl font-bold ${
                customer.balance < 0
                  ? "text-red-600"
                  : customer.balance <= LOW_BALANCE_THRESHOLD && hasTransactions
                  ? "text-red-600"
                  : ""
              }`}
            >
              ¥{formatCurrency(customer.balance)}
            </div>
            <div className="mt-2">
              {customer.balance < 0 ? (
                <Badge variant="destructive">Overdraft</Badge>
              ) : customer.balance <= LOW_BALANCE_THRESHOLD && hasTransactions ? (
                <Badge variant="secondary">Low Balance</Badge>
              ) : (
                <Badge variant="default">Active</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdraft Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              ¥{formatCurrency(customer.max_overdraft_week)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">per week</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateCustomerForm customer={customer} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateAccountForm customer={customer} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cards</CardTitle>
          <AddCardDialogWrapper customerId={customerId} />
        </CardHeader>
        <CardContent>
          <CardsList cards={cards} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsList transactions={transactions} />
        </CardContent>
      </Card>
    </div>
  );
}
