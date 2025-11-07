"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCardByUidAction, createCardAction } from "@/app/actions/cards";
import { getStudentByIdAction, createStudentAction } from "@/app/actions/students";
import type { Card } from "@/lib/models";

/**
 * Global tap alert component
 * Shows a drawer when a card is tapped outside the POS page
 * and allows navigation to POS with the card UID for auto-selection
 * For unregistered cards, shows an enrollment form
 */
export function TapAlert() {
  const router = useRouter();
  const pathname = usePathname();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [open, setOpen] = useState(false);
  const [cardUid, setCardUid] = useState<string>("");
  const [cardData, setCardData] = useState<Card | null>(null);
  const [studentName, setStudentName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showEnrollmentForm, setShowEnrollmentForm] = useState(false);
  const [enrollmentName, setEnrollmentName] = useState("");
  const [enrollmentError, setEnrollmentError] = useState("");
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  useEffect(() => {
    // Only listen for taps on non-POS pages
    if (pathname === "/pos") {
      return;
    }

    const eventSource = new EventSource("/api/nfc/stream?lane=default");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected" || data.type === "keepalive") {
          return;
        }

        // Card tap detected on non-POS page
        if (data.card_uid) {
          setCardUid(data.card_uid);
          setLoading(true);
          setOpen(true);

          // Look up the card to get student info
          const result = await getCardByUidAction(data.card_uid);
          if (result.success && result.data) {
            setCardData(result.data);
            
            // Fetch student details
            const studentResult = await getStudentByIdAction(result.data.student_id);
            if (studentResult.success && studentResult.data) {
              setStudentName(studentResult.data.name);
            } else {
              setStudentName(`Student ID: ${result.data.student_id}`);
            }
          } else {
            setCardData(null);
            setStudentName("Unknown Card");
          }
          setLoading(false);
        }
      } catch (error) {
        console.error("[TapAlert] SSE parse error:", error);
        setLoading(false);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [pathname]);

  const handleGoToPOS = () => {
    setOpen(false);
    setShowEnrollmentForm(false);
    router.push(`/pos?card=${cardUid}`);
  };

  const handleEnroll = () => {
    setShowEnrollmentForm(true);
    setEnrollmentError("");
  };

  const handleEnrollmentSubmit = async (destination: 'pos' | 'topup' | 'none') => {
    setEnrollmentError("");
    setEnrollmentLoading(true);

    try {
      // First create the student
      const studentResult = await createStudentAction({
        name: enrollmentName,
      });

      if (!studentResult.success || !studentResult.data) {
        setEnrollmentError(studentResult.error || "Failed to create student");
        setEnrollmentLoading(false);
        return;
      }

      // Then create the card linked to the student
      const cardResult = await createCardAction({
        card_uid: cardUid,
        student_id: studentResult.data.id,
        status: "active",
      });

      if (!cardResult.success) {
        setEnrollmentError(cardResult.error || "Failed to create card");
        setEnrollmentLoading(false);
        return;
      }

      // Success! Close drawer
      setOpen(false);
      setShowEnrollmentForm(false);
      setEnrollmentName("");
      
      // Navigate based on destination
      if (destination === 'pos') {
        router.push(`/pos?card=${cardUid}`);
      } else if (destination === 'topup') {
        router.push(`/topup?student=${studentResult.data.id}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      setEnrollmentError("An unexpected error occurred");
      console.error("Enrollment error:", error);
    }

    setEnrollmentLoading(false);
  };

  return (
    <Drawer 
      open={open} 
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setShowEnrollmentForm(false);
          setEnrollmentName("");
          setEnrollmentError("");
        }
      }}
    >
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          {!showEnrollmentForm ? (
            <>
              <DrawerHeader>
                <DrawerTitle>Card Detected!</DrawerTitle>
                <DrawerDescription>
                  {cardData 
                    ? "Go to POS to process the transaction."
                    : "This card is not registered. Enroll it now or cancel."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 pb-0">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-muted-foreground">Card UID:</div>
                    <div className="font-mono text-lg font-bold">{cardUid}</div>
                  </div>
                  {loading ? (
                    <div className="text-sm text-muted-foreground">Loading card info...</div>
                  ) : cardData ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-sm text-muted-foreground">Student:</div>
                      <div className="font-medium">{studentName}</div>
                      <div className="text-xs text-muted-foreground">
                        Status: {cardData.status === "active" ? "✓ Active" : "✗ Revoked"}
                      </div>
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Card not found in system. Would you like to enroll this card?
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
              <DrawerFooter>
                {cardData && cardData.status === "active" ? (
                  <Button onClick={handleGoToPOS}>Go to POS</Button>
                ) : (
                  <Button onClick={handleEnroll}>Enroll Card</Button>
                )}
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>Enroll New Card</DrawerTitle>
                <DrawerDescription>
                  Enter the student&apos;s name to register this card.
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 pb-0">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-muted-foreground">Card UID:</div>
                    <div className="font-mono text-sm font-bold">{cardUid}</div>
                  </div>
                  {enrollmentError && (
                    <Alert variant="destructive">
                      <AlertDescription>{enrollmentError}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="student-name">Student Name</Label>
                    <Input
                      id="student-name"
                      value={enrollmentName}
                      onChange={(e) => setEnrollmentName(e.target.value)}
                      placeholder="Enter student name"
                      required
                      disabled={enrollmentLoading}
                    />
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <Button 
                  onClick={() => handleEnrollmentSubmit('topup')}
                  disabled={enrollmentLoading || !enrollmentName}
                >
                  {enrollmentLoading ? "Enrolling..." : "Enroll & Top-up"}
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => handleEnrollmentSubmit('none')}
                  disabled={enrollmentLoading || !enrollmentName}
                >
                  {enrollmentLoading ? "Enrolling..." : "Enroll Only"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowEnrollmentForm(false)}
                  disabled={enrollmentLoading}
                >
                  Back
                </Button>
              </DrawerFooter>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

