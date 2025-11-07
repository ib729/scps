"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import type { StudentWithAccount } from "@/lib/models";
import { posCheckoutAction } from "@/app/actions/pos";
import { getCardByUidAction } from "@/app/actions/cards";

interface PosFormProps {
  students: StudentWithAccount[];
}

type WorkflowMode = "tap-first" | "manual";

export function PosForm({ students }: PosFormProps) {
  const [mode, setMode] = useState<WorkflowMode>("tap-first");
  const [studentId, setStudentId] = useState<string>("");
  const [cardUid, setCardUid] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [tapStatus, setTapStatus] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedStudent = students.find((s) => s.id === parseInt(studentId));

  // Handle card UID from URL parameter (from tap alert navigation)
  useEffect(() => {
    const cardFromUrl = searchParams.get("card");
    if (cardFromUrl && !studentId) {
      // Auto-select student from URL parameter
      handleCardTap(cardFromUrl);
      // Clear the URL parameter after processing
      router.replace("/pos");
    }
  }, [searchParams]);

  // Connect to SSE stream for tap events (only in tap-first mode)
  useEffect(() => {
    if (mode !== "tap-first") {
      return;
    }

    const lane = "default"; // Could be configurable
    const eventSource = new EventSource(`/api/nfc/stream?lane=${lane}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "connected") {
          setTapStatus("Connected to card reader");
          return;
        }

        if (data.type === "keepalive") {
          return;
        }

        // Card tap event
        if (data.card_uid) {
          handleCardTap(data.card_uid);
        }
      } catch (error) {
        console.error("[POS] SSE parse error:", error);
      }
    };

    eventSource.onerror = () => {
      setTapStatus("Disconnected from reader");
    };

    return () => {
      eventSource.close();
    };
  }, [mode]);

  const handleCardTap = async (uid: string) => {
    setTapStatus(`Card detected: ${uid}`);
    setCardUid(uid);

    // Look up the card to find the student
    const cardResult = await getCardByUidAction(uid);
    
    if (!cardResult.success || !cardResult.data) {
      setError(`Card ${uid} not found in system`);
      setTapStatus("");
      return;
    }

    if (cardResult.data.status !== "active") {
      setError(`Card ${uid} is not active`);
      setTapStatus("");
      return;
    }

    const student = students.find((s) => s.id === cardResult.data.student_id);
    
    if (!student) {
      setError("Student not found");
      setTapStatus("");
      return;
    }

    // Tap-first mode: auto-select student, wait for amount
    setStudentId(student.id.toString());
    setSuccess(`${student.name} selected - enter amount to charge`);
    setError("");
    setTapStatus("");
  };

  const processCheckout = async (studId?: number, uid?: string) => {
    const finalStudentId = studId || parseInt(studentId);
    const finalCardUid = uid || cardUid;

    setLoading(true);
    setError("");
    setSuccess("");

    const result = await posCheckoutAction({
      student_id: finalStudentId || undefined,
      card_uid: finalCardUid || undefined,
      amount: parseInt(amount),
      description: description || "POS Purchase",
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      const studentName = students.find((s) => s.id === result.data.transaction.student_id)?.name;
      setSuccess(
        `Successfully charged ¥${amount} to ${studentName}. New balance: ¥${result.data.newBalance}`
      );
      setAmount("");
      setDescription("");
      setStudentId("");
      setCardUid("");
      router.refresh();
    } else {
      setError(result.error || "Failed to process checkout");
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processCheckout();
  };

  return (
    <div className="w-full space-y-4">
      {/* Status bar */}
      {tapStatus && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>{tapStatus}</span>
            <Badge variant="outline">NFC Connected</Badge>
          </AlertDescription>
        </Alert>
      )}

      {/* Mode selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "tap-first" ? "default" : "outline"}
              onClick={() => setMode("tap-first")}
              className="flex-1"
            >
              Tap Card
            </Button>
            <Button
              type="button"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
              className="flex-1"
            >
              Manual
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {mode === "tap-first" 
              ? "Wait for student to tap their card"
              : "Select student manually from dropdown"}
          </p>
        </CardContent>
      </Card>

    <Card>
      <CardHeader>
          <CardTitle>
            {mode === "tap-first" ? "Tap Card to Begin" : "Process Purchase"}
          </CardTitle>
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
              <Label htmlFor="student">
                {mode === "tap-first" ? "Student (tap card or select)" : "Student"}
              </Label>
              <Select 
                value={studentId} 
                onValueChange={setStudentId}
              >
              <SelectTrigger id="student" className="w-full">
                  <SelectValue placeholder="Select a student or tap card" />
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
                {cardUid && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Card UID:
                    </span>
                    <span className="font-mono text-xs">{cardUid}</span>
                  </div>
                )}
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

            <Button 
              type="submit" 
              disabled={loading || !studentId || !amount} 
              className="w-full"
            >
            {loading ? "Processing..." : `Charge ¥${amount || "0"}`}
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}

