/**
 * Tap Event Broadcaster
 * 
 * In-memory event emitter for broadcasting NFC card tap events
 * from the Pi sidecar to connected POS/topup clients via SSE.
 */

export interface TapEvent {
  card_uid: string;
  lane?: string;
  reader_ts?: string;
  timestamp: string;
}

type TapListener = (event: TapEvent) => void;

class TapEventBroadcaster {
  private listeners: Set<TapListener> = new Set();

  subscribe(listener: TapListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: TapEvent): void {
    console.log(`[TapBroadcaster] Broadcasting tap: ${event.card_uid} (${this.listeners.size} listeners)`);
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("[TapBroadcaster] Listener error:", error);
      }
    });
  }

  getListenerCount(): number {
    return this.listeners.size;
  }
}

// Global singleton instance
const tapBroadcaster = new TapEventBroadcaster();

export default tapBroadcaster;

