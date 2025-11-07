"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Global tap alert component
 * Shows a prominent CTA when a card is tapped outside the POS page
 */
export function TapAlert() {
  const [showAlert, setShowAlert] = useState(false);
  const [cardInfo, setCardInfo] = useState<{ uid: string; studentName?: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only listen for taps on non-POS pages
    if (pathname === "/pos") {
      return;
    }

    const eventSource = new EventSource("/api/nfc/stream?lane=default");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected" || data.type === "keepalive") {
          return;
        }

        // Card tap detected on non-POS page
        if (data.card_uid) {
          setCardInfo({ uid: data.card_uid });
          setShowAlert(true);

          // Auto-hide after 10 seconds
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            setShowAlert(false);
          }, 10000);
        }
      } catch (error) {
        console.error("[TapAlert] SSE parse error:", error);
      }
    };

    return () => {
      eventSource.close();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname]);

  const handleGoToPOS = () => {
    setShowAlert(false);
    router.push("/pos");
  };

  const handleDismiss = () => {
    setShowAlert(false);
  };

  if (!showAlert || !cardInfo) {
    return null;
  }

  return (
    <div className="fixed top-20 right-4 z-50 max-w-md animate-in slide-in-from-right">
      <Alert className="border-2 border-blue-500 bg-blue-50 shadow-lg">
        <AlertDescription className="space-y-3">
          <div className="font-semibold text-lg">Card Detected!</div>
          <div className="text-sm">
            Card <span className="font-mono">{cardInfo.uid}</span> was tapped.
            <br />
            Go to POS to process the transaction.
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGoToPOS} size="sm" className="flex-1">
              Go to POS
            </Button>
            <Button onClick={handleDismiss} variant="outline" size="sm">
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

