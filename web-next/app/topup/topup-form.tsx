"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StudentWithAccount } from "@/lib/models";
import { topupAction, adjustBalanceManualAction } from "@/app/actions/topup";

interface TopupFormProps {
  students: StudentWithAccount[];
}

export function TopupForm({ students }: TopupFormProps) {
  const [studentId, setStudentId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // For manual adjustment
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjustSuccess, setAdjustSuccess] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  const selectedStudent = students.find((s) => s.id === parseInt(studentId));

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const result = await topupAction({
      student_id: parseInt(studentId),
      amount: parseInt(amount),
      description: description || undefined,
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      setSuccess(
        `Successfully added ¥${amount} to ${selectedStudent?.name}. New balance: ¥${result.data.newBalance}`
      );
      setAmount("");
      setDescription("");
      router.refresh();
    } else {
      setError(result.error || "Failed to process top-up");
    }

    setLoading(false);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError("");
    setAdjustSuccess("");
    setAdjustLoading(true);

    const result = await adjustBalanceManualAction({
      student_id: parseInt(studentId),
      amount: parseInt(adjustAmount),
      description: adjustDescription,
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      setAdjustSuccess(
        `Balance adjusted by ¥${adjustAmount} for ${selectedStudent?.name}. New balance: ¥${result.data.newBalance}`
      );
      setAdjustAmount("");
      setAdjustDescription("");
      router.refresh();
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
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="student">Student</Label>
              <Select value={studentId} onValueChange={setStudentId} required>
                <SelectTrigger id="student" className="w-full">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id.toString()}>
                      {student.name} (¥{student.balance})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStudent && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Current Balance:
                  </span>
                  <span
                    className={`font-bold ${
                      selectedStudent.balance < 0
                        ? "text-red-600"
                        : selectedStudent.balance < 10
                        ? "text-orange-600"
                        : ""
                    }`}
                  >
                    ¥{selectedStudent.balance}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (¥)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Cash payment, Bank transfer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff">Staff Name (Optional)</Label>
              <Input
                id="staff"
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !studentId}
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
          <p className="text-sm text-muted-foreground mb-4">
            Use this for corrections or adjustments. Can be positive or negative.
          </p>
          <form onSubmit={handleAdjust} className="space-y-6">
            {adjustError && (
              <Alert variant="destructive">
                <AlertDescription>{adjustError}</AlertDescription>
              </Alert>
            )}
            {adjustSuccess && (
              <Alert>
                <AlertDescription>{adjustSuccess}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Adjustment Amount (¥)</Label>
              <Input
                id="adjust-amount"
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g., 10 or -5"
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

            <Button
              type="submit"
              disabled={adjustLoading || !studentId}
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

