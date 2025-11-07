"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

/**
 * Global tap alert component
 * Shows a toast when a card is tapped outside the POS page
 * and navigates to POS with the card UID for auto-selection
 */
export function TapAlert() {
  const router = useRouter();
  const pathname = usePathname();
  const eventSourceRef = useRef<EventSource | null>(null);

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
          toast("Card Detected!", {
            description: `Card ${data.card_uid} tapped. Go to POS to process transaction.`,
            action: {
              label: "Go to POS",
              onClick: () => {
                router.push(`/pos?card=${data.card_uid}`);
              },
            },
            duration: 10000,
          });
        }
      } catch (error) {
        console.error("[TapAlert] SSE parse error:", error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [pathname, router]);

  return null;
}

