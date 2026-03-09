"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check } from "lucide-react";

import { getStudentByIdAction } from "@/app/actions/students";
import { topupAction, adjustBalanceManualAction } from "@/app/actions/topup";
import { StudentSearchField } from "@/components/student-search-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/currency";
import type { StudentWithAccount } from "@/lib/models";

interface TopupFormProps {
  studentIdsWithTransactions: number[];
  userName: string;
}

export function TopupForm({ studentIdsWithTransactions, userName }: TopupFormProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithAccount | null>(null);
  const [selectedAdjustStudent, setSelectedAdjustStudent] =
    useState<StudentWithAccount | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustStaff, setAdjustStaff] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjustSuccess, setAdjustSuccess] = useState("");
  const [adjustTransactionId, setAdjustTransactionId] = useState<number | null>(null);
  const [adjustCopied, setAdjustCopied] = useState(false);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (userName && !staff) {
      setStaff(userName);
    }
  }, [userName, staff]);

  useEffect(() => {
    if (userName && !adjustStaff) {
      setAdjustStaff(userName);
    }
  }, [userName, adjustStaff]);

  useEffect(() => {
    const studentFromUrl = searchParams.get("student");
    if (!studentFromUrl || selectedStudent) {
      return;
    }

    const studentId = Number.parseInt(studentFromUrl, 10);
    if (!Number.isFinite(studentId)) {
      router.replace("/topup");
      return;
    }

    void (async () => {
      const result = await getStudentByIdAction(studentId);
      if (result.success && result.data) {
        setSelectedStudent(result.data);
      }
      router.replace("/topup");
    })();
  }, [searchParams, selectedStudent, router]);

  const copyTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAdjustTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setAdjustCopied(true);
    setTimeout(() => setAdjustCopied(false), 2000);
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setError("");
    setSuccess("");
    setTransactionId(null);
    setLoading(true);

    const result = await topupAction({
      student_id: selectedStudent.id,
      amount: parseFloat(amount),
      description: description || undefined,
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      setSuccess(
        `Successfully added ¥${amount} to ${selectedStudent.name}. New balance: ¥${formatCurrency(
          result.data.newBalance,
        )}`,
      );
      setTransactionId(result.data.transaction.id);
      setSelectedStudent({
        ...selectedStudent,
        balance: result.data.newBalance,
      });
      setAmount("");
      setDescription("");
    } else {
      setError(result.error || "Failed to process top-up");
    }

    setLoading(false);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustStudent) {
      return;
    }

    setAdjustError("");
    setAdjustSuccess("");
    setAdjustTransactionId(null);
    setAdjustLoading(true);

    const result = await adjustBalanceManualAction({
      student_id: selectedAdjustStudent.id,
      amount: parseFloat(adjustAmount),
      description: adjustDescription,
      staff: adjustStaff || undefined,
    });

    if (result.success && result.data) {
      setAdjustSuccess(
        `Balance adjusted by ¥${adjustAmount} for ${selectedAdjustStudent.name}. New balance: ¥${formatCurrency(
          result.data.newBalance,
        )}`,
      );
      setAdjustTransactionId(result.data.transaction.id);
      setSelectedAdjustStudent({
        ...selectedAdjustStudent,
        balance: result.data.newBalance,
      });
      setAdjustAmount("");
      setAdjustDescription("");
    } else {
      setAdjustError(result.error || "Failed to adjust balance");
    }

    setAdjustLoading(false);
  };

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Top-up Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTopup} className="space-y-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <div>{success}</div>
                    {transactionId ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Transaction ID:{" "}
                          <span className="font-mono font-medium">{transactionId}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyTransactionId(transactionId)}
                          className="h-6 w-6 p-0"
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <StudentSearchField
              id="student"
              label="Student"
              placeholder="Search students by name"
              selectedStudent={selectedStudent}
              onSelect={setSelectedStudent}
            />

            {selectedStudent ? (
              <div className="space-y-2 rounded-lg bg-muted p-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance:</span>
                  <span
                    className={`font-bold ${
                      selectedStudent.balance < 0
                        ? "text-red-600"
                        : selectedStudent.balance <= 50 &&
                            studentIdsWithTransactions.includes(selectedStudent.id)
                          ? "text-orange-600"
                          : ""
                    }`}
                  >
                    ¥{formatCurrency(selectedStudent.balance)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (¥)</Label>
              <Input
                id="amount"
                type="number"
                min="0.1"
                step="0.1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (e.g., 5.5)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Wechat Pay, Alipay, Bitcoin, Cash"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff">Staff Name</Label>
              <Input
                id="staff"
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                placeholder="Your name"
                disabled
              />
            </div>

            <Button type="submit" disabled={loading || !selectedStudent} className="w-full">
              {loading ? "Processing..." : `Add ¥${amount || "0"}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Balance Adjustment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdjust} className="space-y-6">
            {adjustError ? (
              <Alert variant="destructive">
                <AlertDescription>{adjustError}</AlertDescription>
              </Alert>
            ) : null}
            {adjustSuccess ? (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <div>{adjustSuccess}</div>
                    {adjustTransactionId ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Transaction ID:{" "}
                          <span className="font-mono font-medium">
                            {adjustTransactionId}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyAdjustTransactionId(adjustTransactionId)}
                          className="h-6 w-6 p-0"
                        >
                          {adjustCopied ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <StudentSearchField
              id="adjust-student"
              label="Student"
              placeholder="Search students by name"
              selectedStudent={selectedAdjustStudent}
              onSelect={setSelectedAdjustStudent}
            />

            {selectedAdjustStudent ? (
              <div className="space-y-2 rounded-lg bg-muted p-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance:</span>
                  <span
                    className={`font-bold ${
                      selectedAdjustStudent.balance < 0
                        ? "text-red-600"
                        : selectedAdjustStudent.balance <= 50 &&
                            studentIdsWithTransactions.includes(selectedAdjustStudent.id)
                          ? "text-orange-600"
                          : ""
                    }`}
                  >
                    ¥{formatCurrency(selectedAdjustStudent.balance)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Adjustment Amount (¥)</Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g., 10.5 or -5.5"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use positive numbers to add, negative to subtract
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-description">Reason (Required)</Label>
              <Textarea
                id="adjust-description"
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                placeholder="Explain the reason for this adjustment"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-staff">Staff Name</Label>
              <Input
                id="adjust-staff"
                value={adjustStaff}
                onChange={(e) => setAdjustStaff(e.target.value)}
                placeholder="Your name"
                disabled
              />
            </div>

            <Button
              type="submit"
              disabled={adjustLoading || !selectedAdjustStudent}
              variant="secondary"
              className="w-full"
            >
              {adjustLoading ? "Adjusting..." : "Apply Adjustment"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
