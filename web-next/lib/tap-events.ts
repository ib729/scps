/**
 * Tap Event Broadcaster
 * 
 * In-memory event emitter for broadcasting NFC card tap events
 * from the Pi sidecar to connected POS/topup clients via WebSocket.
 * 
 * Features:
 * - Server-side deduplication to prevent duplicate taps
 * - Automatic cleanup of old tap records
 * - Thread-safe listener management
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
  private recentTaps = new Map<string, number>();
  private readonly DEBOUNCE_MS = 1000;
  private readonly MAX_RECENT_TAPS = 100;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval to prevent memory leaks
    this.startCleanupInterval();
  }

  /**
   * Subscribe to tap events
   * @param listener Callback function to receive tap events
   * @returns Unsubscribe function
   */
  subscribe(listener: TapListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Broadcast a tap event to all listeners with deduplication
   * @param event Tap event to broadcast
   * @returns true if event was broadcast, false if it was a duplicate
   */
  broadcast(event: TapEvent): boolean {
    // Check for duplicate tap
    const now = Date.now();
    const lastTap = this.recentTaps.get(event.card_uid);

    if (lastTap && (now - lastTap) < this.DEBOUNCE_MS) {
      console.log(`[TapBroadcaster] Duplicate tap ignored: ${event.card_uid} (within ${this.DEBOUNCE_MS}ms)`);
      return false; // Duplicate, don't broadcast
    }

    // Record this tap
    this.recentTaps.set(event.card_uid, now);

    // Clean up if we have too many entries
    if (this.recentTaps.size > this.MAX_RECENT_TAPS) {
      this.cleanupOldTaps();
    }

    // Broadcast to all listeners
    console.log(`[TapBroadcaster] Broadcasting tap: ${event.card_uid} (${this.listeners.size} listeners)`);
    
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("[TapBroadcaster] Listener error:", error);
      }
    });

    return true; // Successfully broadcast
  }

  /**
   * Get the number of active listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Get the number of recent taps being tracked
   */
  getRecentTapCount(): number {
    return this.recentTaps.size;
  }

  /**
   * Start periodic cleanup of old tap records
   */
  private startCleanupInterval(): void {
    // Run cleanup every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTaps();
    }, 10000);

    // Prevent the interval from keeping the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up old tap records that are beyond the debounce window
   */
  private cleanupOldTaps(): void {
    const now = Date.now();
    const cutoff = now - (this.DEBOUNCE_MS * 2); // Keep records for 2x debounce time
    let cleaned = 0;

    for (const [uid, timestamp] of this.recentTaps.entries()) {
      if (timestamp < cutoff) {
        this.recentTaps.delete(uid);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[TapBroadcaster] Cleaned up ${cleaned} old tap record(s)`);
    }
  }

  /**
   * Clear all tap history (useful for testing)
   */
  clearHistory(): void {
    this.recentTaps.clear();
    console.log("[TapBroadcaster] Tap history cleared");
  }

  /**
   * Cleanup resources when shutting down
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.listeners.clear();
    this.recentTaps.clear();
  }
}

// Global singleton instance
const tapBroadcaster = new TapEventBroadcaster();

export default tapBroadcaster;

