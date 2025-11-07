import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllStudents } from "@/lib/repositories/students";
import { getRecentTransactions } from "@/lib/repositories/transactions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const students = getAllStudents();
  const recentTransactions = getRecentTransactions(10);

  const totalStudents = students.length;
  const totalBalance = students.reduce((sum, s) => sum + s.balance, 0);
  const studentsWithNegativeBalance = students.filter((s) => s.balance < 0).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of the snack bar system
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalStudents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Total Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">¥{totalBalance}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Students in Overdraft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{studentsWithNegativeBalance}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transactions yet</p>
            ) : (
              recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{tx.student_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {tx.description || tx.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        tx.type === "TOPUP"
                          ? "default"
                          : tx.type === "DEBIT"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {tx.type}
                    </Badge>
                    <p
                      className={`text-lg font-bold ${
                        tx.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {tx.amount >= 0 ? "+" : ""}¥{tx.amount}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="w-full">
              <Link href="/transactions">View All Transactions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link href="/pos">Process Sale (POS)</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/topup">Top-up Account</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/students">Manage Students</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Students with Low Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {students
                .filter((s) => s.balance < 10)
                .slice(0, 5)
                .map((student) => (
                  <div
                    key={student.id}
                    className="flex justify-between items-center"
                  >
                    <Link
                      href={`/students/${student.id}`}
                      className="hover:underline"
                    >
                      {student.name}
                    </Link>
                    <span
                      className={`font-bold ${
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
    </div>
  );
}

