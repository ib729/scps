/**
 * SSE Stream Endpoint for NFC Tap Events
 * 
 * Clients connect to this endpoint to receive real-time card tap notifications.
 * Uses Server-Sent Events (SSE) for lightweight server-to-client push.
 * 
 * Authentication: Requires valid session (logged-in user)
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import tapBroadcaster, { type TapEvent } from "@/lib/tap-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify authentication - only logged-in users can receive tap notifications
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    console.warn("[SSE] Unauthorized connection attempt");
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lane = searchParams.get("lane") || "default";

  console.log(`[SSE] Client connected to tap stream (lane: ${lane}, user: ${session.user.email})`);

  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Helper to send SSE message
  const sendEvent = (data: string) => {
    const message = `data: ${data}\n\n`;
    writer.write(encoder.encode(message));
  };

  // Subscribe to tap events
  const unsubscribe = tapBroadcaster.subscribe((event: TapEvent) => {
    // Filter by lane if specified
    if (event.lane && event.lane !== lane && lane !== "default") {
      return;
    }

    sendEvent(JSON.stringify(event));
  });

  // Send keepalive every 30s
  const keepaliveInterval = setInterval(() => {
    try {
      sendEvent(JSON.stringify({ type: "keepalive" }));
    } catch (error) {
      console.error("[SSE] Keepalive error:", error);
      clearInterval(keepaliveInterval);
    }
  }, 30000);

  // Clean up on disconnect
  request.signal.addEventListener("abort", () => {
    console.log(`[SSE] Client disconnected (lane: ${lane})`);
    clearInterval(keepaliveInterval);
    unsubscribe();
    writer.close();
  });

  // Send initial connection confirmation
  sendEvent(JSON.stringify({ type: "connected", lane }));

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

