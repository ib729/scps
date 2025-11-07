import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllStudents } from "@/lib/repositories/students";
import { getRecentTransactions } from "@/lib/repositories/transactions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const students = getAllStudents();
  const recentTransactions = getRecentTransactions(10);

  const totalStudents = students.length;
  const totalBalance = students.reduce((sum, s) => sum + s.balance, 0);
  const studentsWithNegativeBalance = students.filter((s) => s.balance < 0).length;
  const studentsWithLowBalance = students.filter((s) => s.balance >= 0 && s.balance < 10).length;

  // Calculate percentage changes (mock data for now - you could track historical data)
  const balanceChange = "+12.5%";
  const overdraftChange = studentsWithNegativeBalance > 0 ? "+8%" : "0%";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of the STUCO snack bar system
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Students
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active accounts in system
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Balance
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalBalance}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">{balanceChange}</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              In Overdraft
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studentsWithNegativeBalance}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {studentsWithNegativeBalance > 0 ? (
                <span className="text-orange-600">Needs attention</span>
              ) : (
                <span className="text-green-600">All accounts positive</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Low Balance
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studentsWithLowBalance}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Students with {"<"}¥10
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4">
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
                          {tx.description || tx.type}
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

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Students with Low Balance</CardTitle>
            <CardDescription>
              {students.filter((s) => s.balance < 10).length} students need top-up
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {students
                .filter((s) => s.balance < 10)
                .slice(0, 5)
                .map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <Link
                        href={`/students/${student.id}`}
                        className="text-sm font-medium leading-none hover:underline"
                      >
                        {student.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {student.balance < 0 ? "Overdraft" : "Low balance"}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        student.balance < 0 ? "text-red-600" : "text-orange-600"
                      }`}
                    >
                      ¥{student.balance}
                    </span>
                  </div>
                ))}
              {students.filter((s) => s.balance < 10).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  All students have sufficient balance
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks and shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Button asChild size="lg" className="h-auto py-6 flex-col gap-2">
            <Link href="/pos">
              <DollarSign className="h-5 w-5" />
              <span>Process Sale</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-auto py-6 flex-col gap-2">
            <Link href="/topup">
              <TrendingUp className="h-5 w-5" />
              <span>Top-up Account</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-auto py-6 flex-col gap-2">
            <Link href="/students">
              <Users className="h-5 w-5" />
              <span>Manage Students</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

