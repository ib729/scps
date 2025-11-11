/**
 * Tap Event Broadcaster - Node.js Compatible Version
 * 
 * This is a CommonJS version that can be imported by the custom server.
 * Maintains the same functionality as the TypeScript version.
 */

class TapEventBroadcaster {
  constructor() {
    this.listeners = new Set();
    this.recentTaps = new Map();
    this.DEBOUNCE_MS = 1000;
    this.MAX_RECENT_TAPS = 100;
    this.cleanupInterval = null;
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Subscribe to tap events
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Broadcast a tap event to all listeners with deduplication
   */
  broadcast(event) {
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
        console.error('[TapBroadcaster] Listener error:', error);
      }
    });

    return true; // Successfully broadcast
  }

  /**
   * Get the number of active listeners
   */
  getListenerCount() {
    return this.listeners.size;
  }

  /**
   * Get the number of recent taps being tracked
   */
  getRecentTapCount() {
    return this.recentTaps.size;
  }

  /**
   * Start periodic cleanup of old tap records
   */
  startCleanupInterval() {
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
  cleanupOldTaps() {
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
  clearHistory() {
    this.recentTaps.clear();
    console.log('[TapBroadcaster] Tap history cleared');
  }

  /**
   * Cleanup resources when shutting down
   */
  destroy() {
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

module.exports = { default: tapBroadcaster, TapEventBroadcaster };

