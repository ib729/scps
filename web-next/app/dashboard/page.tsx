import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllStudents } from "@/lib/repositories/students";
import { getRecentTransactions, getStudentIdsWithTransactions, getWeeklyTopupData, getTotalSalesCount } from "@/lib/repositories/transactions";
import { Users, ShoppingCart, AlertTriangle, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { WeeklyTopupChart } from "@/components/weekly-topup-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const students = getAllStudents();
  const recentTransactions = getRecentTransactions(10);
  const studentIdsWithTransactions = getStudentIdsWithTransactions();
  const weeklyTopupData = getWeeklyTopupData(12);
  const totalSales = getTotalSalesCount();

  const totalStudents = students.length;
  const totalBalance = students.reduce((sum, s) => sum + s.balance, 0);
  const studentsWithNegativeBalance = students.filter((s) => s.balance < 0).length;

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
            <div className="text-2xl font-bold">{totalStudents}</div>
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
            <div className="text-2xl font-bold">{totalSales.toLocaleString()}</div>
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
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className="text-2xl font-bold">¥{totalBalance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Combined balance across all accounts
            </p>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              In Overdraft
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end gap-1">
            <div className="text-2xl font-bold">{studentsWithNegativeBalance}</div>
            <p className="text-xs text-muted-foreground">
              {studentsWithNegativeBalance > 0 ? "Needs attention" : "All accounts positive"}
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
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      tx.type === "TOPUP" 
                        ? "bg-green-100 dark:bg-green-900/20" 
                        : tx.type === "DEBIT"
                        ? "bg-red-100 dark:bg-red-900/20"
                        : "bg-gray-100 dark:bg-gray-900/20"
                    }`}>
                      {tx.amount >= 0 ? (
                        <ArrowUpRight className={`h-4 w-4 ${
                          tx.type === "TOPUP" ? "text-green-600" : "text-gray-600"
                        }`} />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {tx.student_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {tx.description || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p
                      className={`text-sm font-medium ${
                        tx.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount >= 0 ? "+" : ""}¥{Math.abs(tx.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
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

