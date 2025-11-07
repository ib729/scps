/**
 * NFC Tap POST Endpoint
 * 
 * Receives card tap events from the Pi sidecar and broadcasts them
 * to connected SSE clients.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import tapBroadcaster from "@/lib/tap-events";

const tapEventSchema = z.object({
  card_uid: z.string().min(1),
  lane: z.string().optional(),
  reader_ts: z.string().optional(),
  secret: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = tapEventSchema.parse(body);

    // Verify shared secret if configured
    const expectedSecret = process.env.NFC_TAP_SECRET;
    if (expectedSecret && validated.secret !== expectedSecret) {
      console.warn("[NFC Tap] Authentication failed");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Broadcast the tap event
    const tapEvent = {
      card_uid: validated.card_uid,
      lane: validated.lane,
      reader_ts: validated.reader_ts,
      timestamp: new Date().toISOString(),
    };

    tapBroadcaster.broadcast(tapEvent);

    console.log(`[NFC Tap] Received tap: ${validated.card_uid} (lane: ${validated.lane || "default"})`);

    return NextResponse.json({
      success: true,
      listeners: tapBroadcaster.getListenerCount(),
    });
  } catch (error) {
    console.error("[NFC Tap] Error processing tap:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: "nfc-tap-receiver",
    listeners: tapBroadcaster.getListenerCount(),
    timestamp: new Date().toISOString(),
  });
}

