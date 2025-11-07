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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Dialog state for Tap mode
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStudentId, setDialogStudentId] = useState<number>(0);
  const [dialogCardUid, setDialogCardUid] = useState<string>("");
  const [dialogAmount, setDialogAmount] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogStaff, setDialogStaff] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);

  const selectedStudent = students.find((s) => s.id === parseInt(studentId));
  const dialogStudent = students.find((s) => s.id === dialogStudentId);

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
      setIsConnected(false);
      setTapStatus("");
      return;
    }

    setTapStatus("Connecting to card reader...");
    setIsConnected(false);

    const lane = "default"; // Could be configurable
    const eventSource = new EventSource(`/api/nfc/stream?lane=${lane}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("[POS] SSE connection opened");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "connected") {
          setIsConnected(true);
          setTapStatus("Connected to card reader");
          return;
        }

        if (data.type === "keepalive") {
          // Connection is alive, ensure we're marked as connected
          setIsConnected(true);
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

    eventSource.onerror = (err) => {
      console.error("[POS] SSE connection error:", err);
      setIsConnected(false);
      setTapStatus("Disconnected from reader");
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
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

    // Tap-first mode: open dialog for amount entry
    setDialogStudentId(student.id);
    setDialogCardUid(uid);
    setDialogAmount("");
    setDialogDescription("");
    setDialogStaff("");
    setDialogError("");
    setDialogOpen(true);
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

  const handleDialogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogError("");
    setDialogLoading(true);

    const result = await posCheckoutAction({
      student_id: dialogStudentId,
      card_uid: dialogCardUid,
      amount: parseInt(dialogAmount),
      description: dialogDescription || "POS Purchase",
      staff: dialogStaff || undefined,
    });

    if (result.success && result.data) {
      const studentName = students.find((s) => s.id === result.data.transaction.student_id)?.name;
      setSuccess(
        `Successfully charged ¥${dialogAmount} to ${studentName}. New balance: ¥${result.data.newBalance}`
      );
      setDialogOpen(false);
      setDialogAmount("");
      setDialogDescription("");
      setDialogStaff("");
      setDialogStudentId(0);
      setDialogCardUid("");
      router.refresh();
    } else {
      setDialogError(result.error || "Failed to process checkout");
    }

    setDialogLoading(false);
  };

  return (
    <>
      {/* Tap mode dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Process Purchase</DialogTitle>
            <DialogDescription>
              Card detected! Enter the purchase amount to continue.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDialogSubmit}>
            <div className="space-y-4 py-4">
              {dialogError && (
                <Alert variant="destructive">
                  <AlertDescription>{dialogError}</AlertDescription>
                </Alert>
              )}
              {dialogStudent && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Student:</span>
                    <span className="font-medium">{dialogStudent.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Current Balance:</span>
                    <span
                      className={`font-bold ${
                        dialogStudent.balance < 0
                          ? "text-red-600"
                          : dialogStudent.balance < 10
                          ? "text-orange-600"
                          : ""
                      }`}
                    >
                      ¥{dialogStudent.balance}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Card UID:</span>
                    <span className="font-mono text-xs">{dialogCardUid}</span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="dialog-amount">Amount (¥)</Label>
                <Input
                  id="dialog-amount"
                  type="number"
                  min="1"
                  value={dialogAmount}
                  onChange={(e) => setDialogAmount(e.target.value)}
                  placeholder="Enter amount"
                  required
                  autoFocus
                  disabled={dialogLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-description">Description (Optional)</Label>
                <Textarea
                  id="dialog-description"
                  value={dialogDescription}
                  onChange={(e) => setDialogDescription(e.target.value)}
                  placeholder="e.g., Snacks, Drinks"
                  disabled={dialogLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-staff">Staff Name (Optional)</Label>
                <Input
                  id="dialog-staff"
                  value={dialogStaff}
                  onChange={(e) => setDialogStaff(e.target.value)}
                  placeholder="Your name"
                  disabled={dialogLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={dialogLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={dialogLoading || !dialogAmount}>
                {dialogLoading ? "Processing..." : `Charge ¥${dialogAmount || "0"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="w-full space-y-4">
      {/* Status bar - only show in tap-first mode */}
      {mode === "tap-first" && (
        <Alert variant={isConnected ? "default" : "destructive"}>
          <AlertDescription className="flex items-center justify-between">
            <span>{tapStatus || "Connecting..."}</span>
            <Badge variant={isConnected ? "default" : "secondary"}>
              {isConnected ? "NFC Connected" : "NFC Disconnected"}
            </Badge>
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
    </>
  );
}

