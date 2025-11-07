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
import { getCardByUidAction } from "@/app/actions/cards";
import { getStudentByIdAction } from "@/app/actions/students";
import type { Card } from "@/lib/models";

/**
 * Global tap alert component
 * Shows a drawer when a card is tapped outside the POS page
 * and allows navigation to POS with the card UID for auto-selection
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
    router.push(`/pos?card=${cardUid}`);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Card Detected!</DrawerTitle>
            <DrawerDescription>
              A card was tapped. Go to POS to process the transaction.
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
                <div className="text-sm text-destructive">
                  Card not found in system
                </div>
              )}
            </div>
          </div>
          <DrawerFooter>
            <Button onClick={handleGoToPOS} disabled={!cardData || cardData.status !== "active"}>
              Go to POS
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

