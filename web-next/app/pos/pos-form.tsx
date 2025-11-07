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
import { posCheckoutAction } from "@/app/actions/pos";

interface PosFormProps {
  students: StudentWithAccount[];
}

export function PosForm({ students }: PosFormProps) {
  const [studentId, setStudentId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selectedStudent = students.find((s) => s.id === parseInt(studentId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const result = await posCheckoutAction({
      student_id: parseInt(studentId),
      amount: parseInt(amount),
      description: description || "POS Purchase",
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      setSuccess(
        `Successfully charged ¥${amount} to ${selectedStudent?.name}. New balance: ¥${result.data.newBalance}`
      );
      setAmount("");
      setDescription("");
      router.refresh();
    } else {
      setError(result.error || "Failed to process checkout");
    }

    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process Purchase</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
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
              <SelectTrigger id="student">
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
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Overdraft Limit:
                </span>
                <span className="font-medium">
                  ¥{selectedStudent.max_overdraft_week}/week
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
              placeholder="e.g., Snacks, Drinks"
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

          <Button type="submit" disabled={loading || !studentId} className="w-full">
            {loading ? "Processing..." : `Charge ¥${amount || "0"}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

