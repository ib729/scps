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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, LOW_BALANCE_THRESHOLD } from "@/lib/currency";
import type { StudentWithAccount } from "@/lib/models";
import {
  OTHER_PAYMENT_METHOD_MAX_LENGTH,
  PAYMENT_METHOD_VALUES,
  type PaymentMethod,
} from "@/lib/payment-methods";

interface TopupFormProps {
  studentIdsWithTransactions: number[];
  userName: string;
}

export function TopupForm({ studentIdsWithTransactions, userName }: TopupFormProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [otherPaymentMethod, setOtherPaymentMethod] = useState("");
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
      payment_method: paymentMethod as PaymentMethod,
      other_payment_method: paymentMethod === "Other" ? otherPaymentMethod : undefined,
      description: description || undefined,
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
      setPaymentMethod("");
      setOtherPaymentMethod("");
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
          <CardTitle>Top-up Balance</CardTitle>
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
              label="Customer"
              placeholder="Search customers by name"
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
                        : selectedStudent.balance <= LOW_BALANCE_THRESHOLD &&
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
              <Label htmlFor="amount" className="text-base font-medium">
                Amount (¥)
              </Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (e.g., 5.50)"
                className="h-12 text-base md:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method" className="text-base font-medium">
                Payment Method
              </Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => {
                  const nextValue = value as PaymentMethod;
                  setPaymentMethod(nextValue);
                  if (nextValue !== "Other") {
                    setOtherPaymentMethod("");
                  }
                }}
              >
                <SelectTrigger
                  id="payment-method"
                  className="h-12 w-full text-base md:text-base *:data-[slot=select-value]:text-base"
                >
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_VALUES.map((method) => (
                    <SelectItem key={method} value={method} className="text-base md:text-base">
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "Other" ? (
              <div className="space-y-2">
                <Label htmlFor="other-payment-method" className="text-base font-medium">
                  Other Payment Method
                </Label>
                <Input
                  id="other-payment-method"
                  value={otherPaymentMethod}
                  onChange={(e) => setOtherPaymentMethod(e.target.value)}
                  placeholder="Enter payment method"
                  className="h-12 text-base md:text-base"
                  maxLength={OTHER_PAYMENT_METHOD_MAX_LENGTH}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Up to {OTHER_PAYMENT_METHOD_MAX_LENGTH} characters.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-medium">
                Notes (Optional)
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about the top-up"
                className="min-h-[88px] text-base md:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff" className="text-base font-medium">
                Staff Name
              </Label>
              <Input
                id="staff"
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                placeholder="Your name"
                className="h-12 text-base md:text-base"
                disabled
              />
            </div>

            <Button
              type="submit"
              disabled={
                loading ||
                !selectedStudent ||
                !paymentMethod ||
                (paymentMethod === "Other" && !otherPaymentMethod.trim())
              }
              className="w-full"
            >
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
              label="Customer"
              placeholder="Search customers by name"
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
                        : selectedAdjustStudent.balance <= LOW_BALANCE_THRESHOLD &&
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
              <Label htmlFor="adjust-amount" className="text-base font-medium">
                Adjustment Amount (¥)
              </Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g., 10.50 or -5.25"
                className="h-12 text-base md:text-base"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use positive numbers to add, negative to subtract
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-description" className="text-base font-medium">
                Reason (Required)
              </Label>
              <Textarea
                id="adjust-description"
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                placeholder="Explain the reason for this adjustment"
                className="min-h-[88px] text-base md:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-staff" className="text-base font-medium">
                Staff Name
              </Label>
              <Input
                id="adjust-staff"
                value={adjustStaff}
                onChange={(e) => setAdjustStaff(e.target.value)}
                placeholder="Your name"
                className="h-12 text-base"
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
