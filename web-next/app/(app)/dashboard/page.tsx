import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats, getRecentTransactions, getWeeklyTopupData } from "@/lib/repositories/transactions";
import { Users, ShoppingCart, ArrowUpRight, ArrowDownRight, Minus, Landmark, HandCoins } from "lucide-react";
import { WeeklyTopupChart } from "@/components/weekly-topup-chart";
import { formatCurrency } from "@/lib/currency";
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'View student payment statistics and recent transactions',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboardStats = getDashboardStats();
  const recentTransactions = getRecentTransactions(10);
  const weeklyTopupData = getWeeklyTopupData(12);

  return (
    <div className="w-full space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Students
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className="text-2xl font-bold">{dashboardStats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              Active accounts in system
            </p>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sales
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className="text-2xl font-bold">{dashboardStats.totalSales.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Debit transactions completed
            </p>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Balance
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className={`text-2xl font-bold ${dashboardStats.totalBalance < 0 ? "text-red-600" : ""}`}>¥{formatCurrency(dashboardStats.totalBalance)}</div>
            <p className="text-xs text-muted-foreground">
              Combined balance across all accounts
            </p>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className="text-2xl font-bold">¥{formatCurrency(dashboardStats.totalSalesAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Total revenue from sales
            </p>
          </CardContent>
        </Card>
      </div>

      <WeeklyTopupChart data={weeklyTopupData} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            You have {recentTransactions.length} transactions this period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentTransactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transactions yet</p>
            ) : (
              recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${tx.type === "TOPUP"
                      ? "bg-green-100 dark:bg-green-900/20"
                      : tx.type === "DEBIT"
                        ? "bg-red-100 dark:bg-red-900/20"
                        : tx.type === "ADJUST"
                          ? "bg-gray-100 dark:bg-gray-800/40"
                          : "bg-gray-100 dark:bg-gray-900/20"
                      }`}>
                      {tx.type === "ADJUST" ? (
                        <Minus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      ) : tx.amount >= 0 ? (
                        <ArrowUpRight className={`h-4 w-4 ${tx.type === "TOPUP" ? "text-green-600" : "text-gray-600"
                          }`} />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none truncate">
                        {tx.student_name}
                      </p>
                      <p className="text-sm text-muted-foreground break-words">
                        {tx.description || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1 flex-shrink-0">
                    <p
                      className={`text-sm font-medium whitespace-nowrap ${tx.type === "ADJUST"
                        ? "text-gray-600 dark:text-gray-400"
                        : tx.amount >= 0
                          ? "text-green-600"
                          : "text-red-600"
                        }`}
                    >
                      {tx.amount >= 0 ? "+" : ""}¥{formatCurrency(Math.abs(tx.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
