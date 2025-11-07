import { notFound } from "next/navigation";
import { getStudentById } from "@/lib/repositories/students";
import { getTransactionsByStudentId } from "@/lib/repositories/transactions";
import { getCardsByStudentId } from "@/lib/repositories/cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UpdateStudentForm } from "./update-student-form";
import { UpdateAccountForm } from "./update-account-form";
import { AddCardDialog } from "./add-card-dialog";
import { TransactionsList } from "./transactions-list";
import { CardsList } from "./cards-list";

export const dynamic = "force-dynamic";

interface StudentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({
  params,
}: StudentDetailPageProps) {
  const { id } = await params;
  const studentId = parseInt(id, 10);

  if (isNaN(studentId)) {
    notFound();
  }

  const student = getStudentById(studentId);
  if (!student) {
    notFound();
  }

  const transactions = getTransactionsByStudentId(studentId);
  const cards = getCardsByStudentId(studentId);
  const hasTransactions = transactions.length > 0;

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{student.name}</h2>
          <p className="text-muted-foreground mt-1">Student ID: {student.id}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/students">Back to Students</Link>
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
                student.balance < 0
                  ? "text-red-600"
                  : student.balance <= 5 && hasTransactions
                  ? "text-orange-600"
                  : ""
              }`}
            >
              ¥{student.balance}
            </div>
            <div className="mt-2">
              {student.balance < 0 ? (
                <Badge variant="destructive">Overdraft</Badge>
              ) : student.balance <= 5 && hasTransactions ? (
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
              ¥{student.max_overdraft_week}
            </div>
            <p className="text-sm text-muted-foreground mt-2">per week</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateStudentForm student={student} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateAccountForm student={student} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cards</CardTitle>
          <AddCardDialog studentId={studentId} />
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

