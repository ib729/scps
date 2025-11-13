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
import { Copy, Check } from "lucide-react";
import type { StudentWithAccount } from "@/lib/models";
import { posCheckoutAction } from "@/app/actions/pos";
import { getCardByUidAction, createCardAction } from "@/app/actions/cards";
import { createStudentAction } from "@/app/actions/students";
import { EncryptedText } from "@/components/ui/encrypted-text";
import { toDisplayValue, formatCurrency } from "@/lib/currency";
import { useNFCWebSocket } from "@/lib/use-nfc-websocket";
import { useNFCReader } from "@/lib/nfc-reader-context";

interface PosFormProps {
  students: StudentWithAccount[];
  studentIdsWithTransactions: number[];
  userName: string;
}

type WorkflowMode = "tap-first" | "manual";

export function PosForm({ students, studentIdsWithTransactions, userName }: PosFormProps) {
  const { selectedReader } = useNFCReader();
  const [mode, setMode] = useState<WorkflowMode>("tap-first");
  const [studentId, setStudentId] = useState<string>("");
  const [cardUid, setCardUid] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-fill staff name with current user's name
  useEffect(() => {
    if (userName && !staff) {
      setStaff(userName);
    }
  }, [userName, staff]);

  // Dialog state for Tap mode
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStudentId, setDialogStudentId] = useState<number>(0);
  const [dialogCardUid, setDialogCardUid] = useState<string>("");
  const [dialogAmount, setDialogAmount] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogStaff, setDialogStaff] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);

  // Auto-fill dialog staff name with current user's name
  useEffect(() => {
    if (userName && !dialogStaff) {
      setDialogStaff(userName);
    }
  }, [userName, dialogStaff]);

  // Enrollment dialog state for unknown cards
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollCardUid, setEnrollCardUid] = useState<string>("");
  const [enrollName, setEnrollName] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [enrollLoading, setEnrollLoading] = useState(false);

  const selectedStudent = students.find((s) => s.id === parseInt(studentId));
  const dialogStudent = students.find((s) => s.id === dialogStudentId);

  // State to trigger re-animation of the encrypted text
  const [animationKey, setAnimationKey] = useState(0);

  // WebSocket connection for tap events (only in tap-first mode)
  const { isConnected, statusMessage: tapStatus } = useNFCWebSocket({
    lane: selectedReader,
    autoConnect: mode === "tap-first",
    onTap: (event) => {
      console.log("[POS] Card tap detected:", event.card_uid);
      handleCardTap(event.card_uid);
    },
  });

  // Repeat the encryption animation every 3 seconds when in tap-first mode
  useEffect(() => {
    if (mode !== "tap-first") return;
    
    const interval = setInterval(() => {
      setAnimationKey((prev) => prev + 1);
    }, 5000); // Change this value to adjust repeat frequency
    
    return () => clearInterval(interval);
  }, [mode]);

  const copyTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const handleCardTap = async (uid: string) => {
    setCardUid(uid);

    // Look up the card to find the student
    const cardResult = await getCardByUidAction(uid);
    
    if (!cardResult.success || !cardResult.data) {
      // Card not found - offer enrollment
      setEnrollCardUid(uid);
      setEnrollName("");
      setEnrollError("");
      setEnrollDialogOpen(true);
      return;
    }

    if (cardResult.data.status !== "active") {
      setError(`Card ${uid} is not active`);
      return;
    }

    const student = students.find((s) => s.id === cardResult.data.student_id);
    
    if (!student) {
      setError("Student not found");
      return;
    }

    // Tap-first mode: open dialog for amount entry
    setDialogStudentId(student.id);
    setDialogCardUid(uid);
    setDialogAmount("");
    setDialogDescription("");
    setDialogStaff(userName);
    setDialogError("");
    setDialogOpen(true);
  };

  const handleEnrollCard = async (action: 'checkout' | 'topup' | 'none') => {
    setEnrollError("");
    setEnrollLoading(true);

    try {
      // Create the student
      const studentResult = await createStudentAction({
        name: enrollName,
      });

      if (!studentResult.success || !studentResult.data) {
        setEnrollError(studentResult.error || "Failed to create student");
        setEnrollLoading(false);
        return;
      }

      // Create the card
      const cardResult = await createCardAction({
        card_uid: enrollCardUid,
        student_id: studentResult.data.id,
        status: "active",
      });

      if (!cardResult.success) {
        setEnrollError(cardResult.error || "Failed to create card");
        setEnrollLoading(false);
        return;
      }

      // Success! Close enrollment dialog
      setEnrollDialogOpen(false);
      setEnrollName("");

      // Handle the selected action
      if (action === 'checkout') {
        // Continue to checkout - open payment dialog
        setDialogStudentId(studentResult.data.id);
        setDialogCardUid(enrollCardUid);
        setDialogAmount("");
        setDialogDescription("");
        setDialogStaff(userName);
        setDialogError("");
        setDialogOpen(true);
      } else if (action === 'topup') {
        // Navigate to top-up page with student ID
        router.push(`/topup?student=${studentResult.data.id}`);
      } else {
        // Just show success message
        setSuccess(`Successfully enrolled ${enrollName}!`);
      }
    } catch (error) {
      setEnrollError("An unexpected error occurred");
      console.error("Enrollment error:", error);
    }

    setEnrollLoading(false);
  };

  const processCheckout = async (studId?: number, uid?: string) => {
    const finalStudentId = studId || parseInt(studentId);
    const finalCardUid = uid || cardUid;

    setLoading(true);
    setError("");
    setSuccess("");
    setTransactionId(null);

    const result = await posCheckoutAction({
      student_id: finalStudentId || undefined,
      card_uid: finalCardUid || undefined,
      amount: parseFloat(amount),
      description: description || undefined,
      staff: staff || undefined,
    });

    if (result.success && result.data) {
      const studentName = students.find((s) => s.id === result.data.transaction.student_id)?.name;
      setSuccess(
        `Successfully charged ¥${amount} to ${studentName}. New balance: ¥${formatCurrency(result.data.newBalance)}`
      );
      setTransactionId(result.data.transaction.id);
      setAmount("");
      setDescription("");
      setStudentId("");
      setCardUid("");
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
      amount: parseFloat(dialogAmount),
      description: dialogDescription || undefined,
      staff: dialogStaff || undefined,
    });

    if (result.success && result.data) {
      const studentName = students.find((s) => s.id === result.data.transaction.student_id)?.name;
      setSuccess(
        `Successfully charged ¥${dialogAmount} to ${studentName}. New balance: ¥${formatCurrency(result.data.newBalance)}`
      );
      setTransactionId(result.data.transaction.id);
      setDialogOpen(false);
      setDialogAmount("");
      setDialogDescription("");
      setDialogStaff("");
      setDialogStudentId(0);
      setDialogCardUid("");
    } else {
      setDialogError(result.error || "Failed to process checkout");
    }

    setDialogLoading(false);
  };

  return (
    <>
      {/* Enrollment dialog for unknown cards */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Enroll New Card</DialogTitle>
            <DialogDescription>
              This card is not registered. Enter the student&apos;s name to enroll.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {enrollError && (
              <Alert variant="destructive">
                <AlertDescription>{enrollError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="enroll-card-uid">Card UID</Label>
              <Input
                id="enroll-card-uid"
                value={enrollCardUid}
                className="font-mono text-xs"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-name">Student Name</Label>
              <Input
                id="enroll-name"
                value={enrollName}
                onChange={(e) => setEnrollName(e.target.value)}
                placeholder="Enter student name"
                disabled={enrollLoading}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              variant="secondary"
              onClick={() => handleEnrollCard('topup')}
              disabled={enrollLoading || !enrollName}
              className="w-full"
            >
              {enrollLoading ? "Enrolling..." : "Enroll & Top-up"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleEnrollCard('none')}
              disabled={enrollLoading || !enrollName}
              className="w-full"
            >
              {enrollLoading ? "Enrolling..." : "Enroll Only"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEnrollDialogOpen(false)}
              disabled={enrollLoading}
              className="w-full"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                          : dialogStudent.balance <= 50 && studentIdsWithTransactions.includes(dialogStudent.id)
                          ? "text-orange-600"
                          : ""
                      }`}
                    >
                      ¥{formatCurrency(dialogStudent.balance)}
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
                  min="0.1"
                  step="0.1"
                  value={dialogAmount}
                  onChange={(e) => setDialogAmount(e.target.value)}
                  placeholder="Enter amount (e.g., 5.5)"
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

      <div className="w-full space-y-6">
        {/* Mode selector - more prominent */}
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Button
                type="button"
                variant={mode === "tap-first" ? "default" : "outline"}
                onClick={() => setMode("tap-first")}
                className="flex-1 h-14 text-lg font-semibold"
              >
                Tap Card
              </Button>
              <Button
                type="button"
                variant={mode === "manual" ? "default" : "outline"}
                onClick={() => setMode("manual")}
                className="flex-1 h-14 text-lg font-semibold"
              >
                Manual
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {mode === "tap-first" 
                ? "Fast checkout with NFC card tap"
                : "Select student manually from the list"}
            </p>
          </CardContent>
        </Card>

        {/* Success message - shown for both modes */}
        {success && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <AlertDescription>
              <div className="space-y-2">
                <div className="text-green-800 dark:text-green-200 font-medium">{success}</div>
                {transactionId && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-green-700 dark:text-green-300">
                      Transaction ID: <span className="font-mono font-semibold">{transactionId}</span>
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
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error message - shown for both modes */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* TAP CARD MODE - Waiting screen */}
        {mode === "tap-first" && (
          <>
            {/* Status bar */}
            <Alert variant={isConnected ? "default" : "destructive"} className="border-2">
              <AlertDescription className="flex items-center justify-between">
                <span className="font-medium">{tapStatus || "Connecting..."}</span>
                <Badge variant={isConnected ? "default" : "secondary"} className="text-sm px-3 py-1">
                  {isConnected ? "NFC Connected" : "NFC Disconnected"}
                </Badge>
              </AlertDescription>
            </Alert>

            {/* Waiting card with instructions */}
            <Card className="border-2 border-primary/20 flex-1">
              <CardContent className="flex items-center justify-center min-h-[400px] py-12 text-center">
                <div className="space-y-4 max-w-2xl mx-auto">
                  <p className="text-lg font-normal">
                    <EncryptedText
                      key={animationKey}
                      text="Waiting for student to tap card..."
                      encryptedClassName="text-neutral-500"
                      revealedClassName="dark:text-white text-black"
                      revealDelayMs={50}
                      completedClassName="animate-breathe"
                    />
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* MANUAL MODE - Form */}
        {mode === "manual" && (
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-2xl">Process Purchase Manually</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="student" className="text-base">Student</Label>
                  <Select 
                    value={studentId} 
                    onValueChange={setStudentId}
                  >
                    <SelectTrigger id="student" className="w-full h-12 text-base">
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id.toString()}>
                          {student.name} (¥{formatCurrency(student.balance)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedStudent && (
                  <div className="p-5 bg-muted rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base text-muted-foreground">
                        Current Balance:
                      </span>
                      <span
                        className={`font-bold text-xl ${
                          selectedStudent.balance < 0
                            ? "text-red-600"
                            : selectedStudent.balance <= 50 && studentIdsWithTransactions.includes(selectedStudent.id)
                            ? "text-orange-600"
                            : ""
                        }`}
                      >
                        ¥{formatCurrency(selectedStudent.balance)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-base text-muted-foreground">
                        Overdraft Limit:
                      </span>
                      <span className="font-medium text-base">
                        ¥{formatCurrency(selectedStudent.max_overdraft_week)}/week
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-base">Amount (¥)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount (e.g., 5.5)"
                    required
                    className="text-xl h-14"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-base">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Snacks, Drinks"
                    className="text-base min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff" className="text-base">Staff Name (Optional)</Label>
                  <Input
                    id="staff"
                    value={staff}
                    onChange={(e) => setStaff(e.target.value)}
                    placeholder="Your name"
                    className="text-base h-12"
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={loading || !studentId || !amount} 
                  className="w-full h-14 text-lg font-semibold"
                >
                  {loading ? "Processing..." : `Charge ¥${amount || "0"}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

